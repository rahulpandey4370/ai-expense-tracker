
"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Settings, LifeBuoy, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext"; // Import useAuth
import { useRouter } from "next/navigation"; // Import useRouter
import { useToast } from "@/hooks/use-toast";
import { savePushSubscription, sendTestPush } from "@/lib/actions/pending";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export function UserNav() {
  const { logout } = useAuth(); // Get logout function
  const router = useRouter(); // Get router instance
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    // The logout function in AuthContext already handles router.push('/login')
  };

  // Subscribes this device to Web Push and stores it on the server.
  // On iPhone this only works from the Home Screen app (iOS 16.4+), not a Safari tab.
  const handleEnableNotifications = async () => {
    const fail = (title: string, description: string) =>
      toast({ title, description, variant: "destructive" });

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return fail(
        "Push not available here",
        "On iPhone: open this site in Safari, tap Share → Add to Home Screen, then enable notifications from the Home Screen app."
      );
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return fail("Push not configured", "NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing on the server.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return fail("Notifications blocked", "Allow notifications for FinWise in iPhone Settings → Notifications.");
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));
      await savePushSubscription(subscription.toJSON(), navigator.userAgent);
      await sendTestPush();
      toast({ title: "Notifications enabled", description: "A test notification is on its way." });
    } catch (error: any) {
      fail("Could not enable notifications", error?.message ?? "Unknown error");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            {/* No AvatarImage, so fallback will always be used */}
            <AvatarFallback>R</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Rahul</p>
            <p className="text-xs leading-none text-muted-foreground">
              rahul@example.com
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push('/settings')}> {/* Example: direct to settings */}
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
           <DropdownMenuItem onClick={handleEnableNotifications}>
            <Bell className="mr-2 h-4 w-4" />
            <span>Enable Notifications</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
            <LifeBuoy className="mr-2 h-4 w-4" />
            <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
            API
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}> {/* Call handleLogout */}
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
