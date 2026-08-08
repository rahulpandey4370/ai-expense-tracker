"use client";

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SplitUser, TransactionSplitInput } from '@/lib/types';

export type SplitMode = 'equally' | 'shares' | 'custom' | 'not_mine';

export interface SplitEditorValue {
  splitMethod: SplitMode;
  paidById?: string;               // undefined = I paid
  myShare: number;
  splits: TransactionSplitInput[]; // other participants' shares
}

interface SplitEditorProps {
  totalAmount: number;
  users: SplitUser[];
  value: SplitEditorValue | null;
  onChange: (value: SplitEditorValue | null) => void;
  onAddUser: (name: string) => Promise<SplitUser>;
  /** Shortcut mode: this is someone else's charge entirely, my share is 0. */
  forceNotMine?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Splits `total` across `n` shares in whole paisa, giving the remainder to the first share. */
function splitEqually(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((total / n) * 100) / 100;
  const shares = new Array(n).fill(base);
  const distributed = round2(base * n);
  shares[0] = round2(shares[0] + (total - distributed));
  return shares;
}

export function SplitEditor({ totalAmount, users, value, onChange, onAddUser, forceNotMine }: SplitEditorProps) {
  const [mode, setMode] = useState<SplitMode>(forceNotMine ? 'not_mine' : value?.splitMethod ?? 'equally');
  const [paidById, setPaidById] = useState<string | undefined>(value?.paidById);
  const [participantIds, setParticipantIds] = useState<string[]>(
    value?.splits.map(s => s.userId) ?? []
  );
  const [customShares, setCustomShares] = useState<Record<string, string>>(
    Object.fromEntries((value?.splits ?? []).map(s => [s.userId, String(s.shareAmount)]))
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [isAddingPerson, setIsAddingPerson] = useState(false);

  useEffect(() => {
    if (forceNotMine) setMode('not_mine');
  }, [forceNotMine]);

  const allPeople = useMemo(() => [{ id: '__me__', name: 'Me' }, ...users], [users]);

  const toggleParticipant = (userId: string) => {
    setParticipantIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    setIsAddingPerson(true);
    try {
      const user = await onAddUser(newPersonName.trim());
      setParticipantIds(prev => [...prev, user.id]);
      setNewPersonName('');
    } finally {
      setIsAddingPerson(false);
    }
  };

  // "Not mine" mode only needs a single person — the one whose charge this is.
  const notMinePersonId = mode === 'not_mine' ? participantIds[0] : undefined;

  const remaining = useMemo(() => {
    if (mode !== 'custom') return 0;
    const othersSum = participantIds.reduce((sum, id) => sum + (parseFloat(customShares[id]) || 0), 0);
    const myShareInput = paidById ? 0 : parseFloat(customShares['__me__'] || '0');
    return round2(totalAmount - othersSum - (paidById ? 0 : myShareInput));
  }, [mode, participantIds, customShares, totalAmount, paidById]);

  // Recompute and emit the resolved value whenever an input changes.
  useEffect(() => {
    if (mode === 'not_mine') {
      if (!notMinePersonId) { onChange(null); return; }
      onChange({
        splitMethod: 'not_mine',
        paidById: undefined,
        myShare: 0,
        splits: [{ userId: notMinePersonId, shareAmount: round2(totalAmount) }],
      });
      return;
    }

    if (participantIds.length === 0) {
      onChange(null);
      return;
    }

    if (mode === 'equally') {
      const n = participantIds.length + (paidById ? 0 : 1); // + me, unless someone else paid and I'm excluded
      const shares = splitEqually(totalAmount, n);
      const myShare = paidById ? shares[0] : shares[participantIds.length];
      const splits = participantIds.map((id, i) => ({ userId: id, shareAmount: shares[i] }));
      onChange({ splitMethod: 'equally', paidById, myShare: paidById ? 0 : myShare, splits });
      return;
    }

    // custom
    const splits = participantIds.map(id => ({ userId: id, shareAmount: parseFloat(customShares[id]) || 0 }));
    const myShare = paidById ? 0 : (parseFloat(customShares['__me__']) || 0);
    onChange({ splitMethod: 'custom', paidById, myShare, splits });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, paidById, participantIds, customShares, totalAmount, notMinePersonId]);

  const myComputedShare = value?.myShare ?? 0;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      {!forceNotMine && (
        <RadioGroup value={mode} onValueChange={v => setMode(v as SplitMode)} className="flex flex-wrap gap-x-4 gap-y-1">
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="equally" id="split-equally" />
            <Label htmlFor="split-equally" className="text-sm font-normal">Equally</Label>
          </div>
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="custom" id="split-custom" />
            <Label htmlFor="split-custom" className="text-sm font-normal">Exact amounts</Label>
          </div>
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="not_mine" id="split-not-mine" />
            <Label htmlFor="split-not-mine" className="text-sm font-normal">Not my expense</Label>
          </div>
        </RadioGroup>
      )}

      {mode === 'not_mine' ? (
        <div>
          <Label className="text-xs text-muted-foreground">Whose charge is this?</Label>
          <Select value={notMinePersonId} onValueChange={id => setParticipantIds([id])}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select person" /></SelectTrigger>
            <SelectContent>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <PersonAdder onAdd={handleAddPerson} name={newPersonName} setName={setNewPersonName} isAdding={isAddingPerson} />
        </div>
      ) : (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">Split with</Label>
            <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="mt-1 h-auto min-h-9 w-full justify-between">
                  <div className="flex flex-wrap gap-1">
                    {participantIds.length > 0 ? (
                      participantIds.map(id => {
                        const user = users.find(u => u.id === id);
                        return <Badge key={id} variant="secondary">{user?.name ?? id}</Badge>;
                      })
                    ) : (
                      <span className="text-muted-foreground">Select people...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search people..." />
                  <CommandEmpty>No one found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      {users.map(user => (
                        <CommandItem key={user.id} value={user.name} onSelect={() => toggleParticipant(user.id)}>
                          <Check className={cn("mr-2 h-4 w-4", participantIds.includes(user.id) ? "opacity-100" : "opacity-0")} />
                          {user.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <PersonAdder onAdd={handleAddPerson} name={newPersonName} setName={setNewPersonName} isAdding={isAddingPerson} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Paid by</Label>
            <Select value={paidById ?? '__me__'} onValueChange={v => setPaidById(v === '__me__' ? undefined : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allPeople.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {mode === 'custom' && participantIds.length > 0 && (
            <div className="space-y-2 rounded-md border bg-background p-2">
              {!paidById && (
                <div className="flex items-center gap-2">
                  <Label className="w-1/3 truncate text-sm">Me</Label>
                  <Input
                    type="number" placeholder="0.00" className="h-8 text-sm"
                    value={customShares['__me__'] || ''}
                    onChange={e => setCustomShares({ ...customShares, __me__: e.target.value })}
                  />
                </div>
              )}
              {participantIds.map(id => {
                const user = users.find(u => u.id === id);
                return (
                  <div key={id} className="flex items-center gap-2">
                    <Label className="w-1/3 truncate text-sm" title={user?.name}>{user?.name}</Label>
                    <Input
                      type="number" placeholder="0.00" className="h-8 text-sm"
                      value={customShares[id] || ''}
                      onChange={e => setCustomShares({ ...customShares, [id]: e.target.value })}
                    />
                  </div>
                );
              })}
              <p className={cn("text-xs font-medium", Math.abs(remaining) > 0.01 ? 'text-red-500' : 'text-green-500')}>
                Remaining: ₹{remaining.toFixed(2)}
              </p>
            </div>
          )}

          {participantIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {paidById
                ? `You owe ₹${myComputedShare.toFixed(2)} to ${users.find(u => u.id === paidById)?.name ?? 'the payer'}.`
                : `Your share: ₹${myComputedShare.toFixed(2)}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PersonAdder({ onAdd, name, setName, isAdding }: { onAdd: () => void; name: string; setName: (v: string) => void; isAdding: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Input
        placeholder="Add a new person"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
        className="h-8 text-sm"
      />
      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={onAdd} disabled={!name.trim() || isAdding}>
        <UserPlus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
