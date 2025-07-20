
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

export function UserNav() {
  const { logout } = useAuth(); // Get logout function
  const router = useRouter(); // Get router instance
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    // The logout function in AuthContext already handles router.push('/login')
  };

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      toast({
        title: "Notifications Not Supported",
        description: "This browser does not support desktop notifications.",
        variant: "destructive",
      });
      return;
    }

    if (Notification.permission === "granted") {
      toast({
        title: "Notifications Already Enabled",
        description: "You're all set to receive notifications.",
      });
      // Here you would typically send the subscription to your server
      // const subscription = await swRegistration.pushManager.getSubscription();
      // sendSubscriptionToServer(subscription);
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast({
          title: "Notifications Enabled!",
          description: "You will now receive updates from FinWise AI.",
        });
        // Here you would also send the subscription to your server
      } else {
        toast({
          title: "Notifications Not Enabled",
          description: "You have blocked notifications. You can change this in your browser settings.",
          variant: "destructive",
        });
      }
    } else {
       toast({
          title: "Notifications Blocked",
          description: "You have previously blocked notifications. Please enable them in your browser settings.",
          variant: "destructive",
        });
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
