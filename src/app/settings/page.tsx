
"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Bell, Palette, ShieldCheck, Save, SettingsIcon } from "lucide-react";
import { ThemeToggle } from '@/components/theme-toggle'; 

export default function SettingsPage() {
  const [userProfile, setUserProfile] = useState({
    name: "Rahul",
    email: "rahul@example.com",
  });
  const [notifications, setNotifications] = useState({
    spendingAlerts: true,
    monthlySummary: false,
    aiInsightsEmail: true,
  });

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserProfile({ ...userProfile, [e.target.name]: e.target.value });
  };

  const handleNotificationChange = (name: keyof typeof notifications) => {
    setNotifications({ ...notifications, [name]: !notifications[name] });
  };

  const handleSaveChanges = () => {
    // In a real app, you would persist these settings
    console.log("Saving settings:", { userProfile, notifications });
    toast({
      title: "Settings Saved!",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <Card className="shadow-xl border-primary/20 border-2 rounded-xl bg-card/80">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
            <SettingsIcon className="w-8 h-8 text-primary transform -rotate-3"/>
            Application Settings
          </CardTitle>
          <CardDescription className="text-muted-foreground/80">
            Configure your application preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><User className="text-accent"/>User Profile</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-foreground/80">Full Name</Label>
                <Input id="name" name="name" value={userProfile.name} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" />
              </div>
              <div>
                <Label htmlFor="email" className="text-foreground/80">Email Address</Label>
                <Input id="email" name="email" type="email" value={userProfile.email} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent" />
              </div>
            </div>
          </section>

          <Separator className="my-6 border-primary/20" />

          
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><Bell className="text-accent"/>Notifications</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="spendingAlerts" className="text-foreground/80">Spending Alerts</Label>
                <Switch id="spendingAlerts" checked={notifications.spendingAlerts} onCheckedChange={() => handleNotificationChange('spendingAlerts')} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="monthlySummary" className="text-foreground/80">Monthly Summary Email</Label>
                <Switch id="monthlySummary" checked={notifications.monthlySummary} onCheckedChange={() => handleNotificationChange('monthlySummary')} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="aiInsightsEmail" className="text-foreground/80">Receive AI Insights by Email</Label>
                <Switch id="aiInsightsEmail" checked={notifications.aiInsightsEmail} onCheckedChange={() => handleNotificationChange('aiInsightsEmail')} />
              </div>
            </div>
          </section>

          <Separator className="my-6 border-primary/20" />

          
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><Palette className="text-accent"/>Appearance</h3>
            <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
              <Label htmlFor="darkMode" className="text-foreground/80">Theme</Label>
              <ThemeToggle />
            </div>
          </section>
          
          <Separator className="my-6 border-primary/20" />

          
          <section>
            <h3 className="text-xl font-semibold text-primary/90 mb-4 flex items-center gap-2"><ShieldCheck className="text-accent"/>Data & Privacy</h3>
             <div className="space-y-3">
                <Button variant="outline" className="w-full md:w-auto border-red-500/50 text-red-600 hover:bg-red-500/10">Export My Data</Button>
                <Button variant="destructive" className="w-full md:w-auto">Delete My Account</Button>
             </div>
             <p className="text-xs text-muted-foreground/70 mt-2">Be careful, some actions are irreversible!</p>
          </section>

          <div className="mt-8 flex justify-end">
            <Button onClick={handleSaveChanges} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
