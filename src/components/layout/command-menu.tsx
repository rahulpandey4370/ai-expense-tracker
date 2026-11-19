"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Plus, Search, Sun } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { navGroups } from './app-sidebar';
import { withViewTransition } from '@/lib/view-transition';

/** "⌘" on Apple devices, "Ctrl" elsewhere. Starts as "Ctrl" on the server and fixes itself after mount. */
export function useModKey() {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod('⌘');
  }, []);
  return mod;
}

/**
 * Cmd/Ctrl+K: jump to any page or run a common action, keyboard only.
 * Pages are grouped the same way as the sidebar, so what you learned there applies here.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const mod = useModKey();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modifier chord never types a character, so it's safe even while a field has focus.
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const dark = resolvedTheme === 'dark';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-md border bg-background/60 pl-2.5 pr-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="h-4 w-4" />
        <span className="pr-4">Search</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium">{mod} K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Go to a page or run an action</DialogTitle>
        <CommandInput placeholder="Go to a page or run an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => router.push('/transactions?new=1'))}>
              <Plus className="mr-2" /> Add a transaction
            </CommandItem>
            <CommandItem onSelect={() => run(() => withViewTransition(() => setTheme(dark ? 'light' : 'dark')))}>
              {dark ? <Sun className="mr-2" /> : <Moon className="mr-2" />} Switch to {dark ? 'light' : 'dark'} theme
            </CommandItem>
          </CommandGroup>
          {navGroups.map((group, i) => (
            <CommandGroup key={group.label ?? i} heading={group.label ?? 'Pages'}>
              {group.items.map(({ href, label, icon: Icon }) => (
                <CommandItem key={href} value={`${label} ${href}`} onSelect={() => run(() => router.push(href))}>
                  <Icon className="mr-2" /> {label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex items-center justify-end gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span><CommandShortcut className="ml-0 tracking-normal">↑↓</CommandShortcut> move</span>
          <span><CommandShortcut className="ml-0 tracking-normal">↵</CommandShortcut> open</span>
          <span><CommandShortcut className="ml-0 tracking-normal">{mod} K</CommandShortcut> close</span>
        </div>
      </CommandDialog>
    </>
  );
}
