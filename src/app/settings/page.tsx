
"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Bell, Palette, ShieldCheck, Save } from "lucide-react";
import { ThemeToggle } from '@/components/theme-toggle'; // Re-use existing theme toggle

export default function SettingsPage() {
  const [userProfile, setUserProfile] = useState({
    name: "Rahul Potter",
    email: "rahul.potter@hogwarts.ac.uk",
  });
  const [notifications, setNotifications] = useState({
    spendingAlerts: true,
    monthlySummary: false,
    aiInsightsEmail: true,
  });
  const [darkMode, setDarkMode] = useState(false); // Local state, ThemeProvider handles actual theme

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserProfile({ ...userProfile, [e.target.name]: e.target.value });
  };

  const handleNotificationChange = (name: keyof typeof notifications) => {
    setNotifications({ ...notifications, [name]: !notifications[name] });
  };

  const handleSaveChanges = () => {
    // In a real app, you would save these settings to a backend or localStorage
    console.log("Saving settings:", { userProfile, notifications });
    toast({
      title: "Settings Saved!",
      description: "Your preferences have been updated with a flick of a wand.",
    });
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <Card className="shadow-xl border-primary/20 border-2 rounded-xl bg-card/80">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-purple-500 transform -rotate-3">
                <path d="M12 2.25a.75.75 0 0 1 .75.75v2.033a10.46 10.46 0 0 12.81.5H16.5a.75.75 0 0 1 0 1.5h-1.033a10.438 10.438 0 0 1-.499 2.811.75.75 0 0 1-1.409-.522 8.949 8.949 0 0 0 .422-2.289H8.017a8.949 8.949 0 0 0 .422 2.289.75.75 0 0 1-1.409.522A10.438 10.438 0 0 1 6.533 7.033H5.5a.75.75 0 0 1 0-1.5h1.033a10.46 10.46 0 0 1 2.81-.5V3a.75.75 0 0 1 .75-.75Zm3.75 9a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0Zm-4.751 3.493a.75.75 0 0 1 .105 1.05A8.952 8.952 0 0 0 12 18.75a8.952 8.952 0 0 0 2.396-1.957.75.75 0 1 1 1.156 1.008A10.452 10.452 0 0 1 12 20.25a10.452 10.452 0 0 1-3.552-2.207.75.75 0 0 1 1.05-.105Z" />
            </svg>
            Ministry of Preferences (Settings)
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            Adjust your magical settings here. Make sure your preferences are just right!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* User Profile Section */}
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><User className="text-yellow-500"/>Your Wizarding Profile</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-foreground/80">Full Name (as on your Hogwarts Letter)</Label>
                <Input id="name" name="name" value={userProfile.name} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" />
              </div>
              <div>
                <Label htmlFor="email" className="text-foreground/80">Owl Post Address (Email)</Label>
                <Input id="email" name="email" type="email" value={userProfile.email} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" />
              </div>
            </div>
          </section>

          <Separator className="my-6 border-primary/20" />

          {/* Notifications Section */}
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><Bell className="text-yellow-500"/>Owl Notifications</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="spendingAlerts" className="text-foreground/80">Spending Alerts (Warns like a Howler)</Label>
                <Switch id="spendingAlerts" checked={notifications.spendingAlerts} onCheckedChange={() => handleNotificationChange('spendingAlerts')} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="monthlySummary" className="text-foreground/80">Monthly Summary via Owl Post</Label>
                <Switch id="monthlySummary" checked={notifications.monthlySummary} onCheckedChange={() => handleNotificationChange('monthlySummary')} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="aiInsightsEmail" className="text-foreground/80">Receive AI Insights by Email</Label>
                <Switch id="aiInsightsEmail" checked={notifications.aiInsightsEmail} onCheckedChange={() => handleNotificationChange('aiInsightsEmail')} />
              </div>
            </div>
          </section>

          <Separator className="my-6 border-primary/20" />

          {/* Appearance Section */}
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><Palette className="text-yellow-500"/>Magical Appearance</h3>
            <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
              <Label htmlFor="darkMode" className="text-foreground/80">Dark Arts Mode (Theme)</Label>
              <ThemeToggle />
            </div>
          </section>
          
          <Separator className="my-6 border-primary/20" />

           {/* Data & Privacy Section */}
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><ShieldCheck className="text-yellow-500"/>Data Charms & Privacy</h3>
             <div className="space-y-3">
                <Button variant="outline" className="w-full md:w-auto border-red-500/50 text-red-600 hover:bg-red-500/10">Export My Financial Spells (Data)</Button>
                <Button variant="destructive" className="w-full md:w-auto">Obliviate My Account (Delete)</Button>
             </div>
             <p className="text-xs text-muted-foreground/70 mt-2">Be careful, some charms are irreversible!</p>
          </section>


          <div className="mt-8 flex justify-end">
            <Button onClick={handleSaveChanges} className="bg-yellow-500 hover:bg-yellow-600 text-primary-foreground">
              <Save className="mr-2 h-4 w-4" />
              Enchant Settings (Save Changes)
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
