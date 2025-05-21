
"use client";

import { useState } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { User, Bell, Palette, ShieldCheck, Save, SettingsIcon } from "lucide-react";
import { ThemeToggle } from '@/components/theme-toggle'; 
import { cn } from '@/lib/utils';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const sectionVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const buttonHoverTap = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

export default function SettingsPage() {
  const [userProfile, setUserProfile] = useState({
    name: "FinWise User", // Changed from Rahul
    email: "user@finwise.ai", // Changed from rahul@example.com
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
    // In a real app, you'd save these to a backend or localStorage
    console.log("Saving settings:", { userProfile, notifications });
    toast({
      title: "Settings Saved!",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 bg-background/80 backdrop-blur-sm">
      <motion.div variants={pageVariants} initial="hidden" animate="visible">
        <Card className={cn("shadow-xl border-primary/20 border-2 rounded-xl bg-card/80", glowClass)}>
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <SettingsIcon className="w-7 h-7 md:w-8 md:h-8 text-primary transform -rotate-3"/>
              Application Settings
            </CardTitle>
            <CardDescription className="text-sm md:text-base text-muted-foreground">
              Configure your application preferences for FinWise AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><User className="text-accent"/>User Profile</h3>
              <motion.div variants={itemVariants} className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-sm text-foreground">Full Name</Label>
                  <Input id="name" name="name" value={userProfile.name} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground text-sm md:text-base" />
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm text-foreground">Email Address</Label>
                  <Input id="email" name="email" type="email" value={userProfile.email} onChange={handleProfileChange} className="mt-1 bg-background/70 border-primary/30 focus:border-accent focus:ring-accent text-foreground placeholder:text-muted-foreground text-sm md:text-base" />
                </div>
              </motion.div>
            </motion.section>

            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Bell className="text-accent"/>Notifications</h3>
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="spendingAlerts" className="text-sm text-foreground">Spending Alerts</Label>
                  <Switch id="spendingAlerts" checked={notifications.spendingAlerts} onCheckedChange={() => handleNotificationChange('spendingAlerts')} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="monthlySummary" className="text-sm text-foreground">Monthly Summary Email</Label>
                  <Switch id="monthlySummary" checked={notifications.monthlySummary} onCheckedChange={() => handleNotificationChange('monthlySummary')} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                  <Label htmlFor="aiInsightsEmail" className="text-sm text-foreground">Receive AI Insights by Email</Label>
                  <Switch id="aiInsightsEmail" checked={notifications.aiInsightsEmail} onCheckedChange={() => handleNotificationChange('aiInsightsEmail')} />
                </div>
              </motion.div>
            </motion.section>

            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><Palette className="text-accent"/>Appearance</h3>
              <motion.div variants={itemVariants} className="flex items-center justify-between p-3 rounded-md bg-background/50 border border-primary/10">
                <Label htmlFor="darkMode" className="text-sm text-foreground">Theme</Label>
                <ThemeToggle />
              </motion.div>
            </motion.section>
            
            <Separator className="my-6 border-primary/20" />
            
            <motion.section variants={sectionVariants}>
              <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4 flex items-center gap-2"><ShieldCheck className="text-accent"/>Data & Privacy</h3>
              <motion.div variants={itemVariants} className="space-y-3 flex flex-col sm:flex-row sm:space-y-0 sm:space-x-3">
                  <motion.div {...buttonHoverTap} className="w-full sm:w-auto"><Button variant="outline" className="w-full sm:w-auto border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs md:text-sm">Export My Data</Button></motion.div>
                  <motion.div {...buttonHoverTap} className="w-full sm:w-auto"><Button variant="destructive" className="w-full sm:w-auto text-xs md:text-sm">Delete My Account</Button></motion.div>
              </motion.div>
              <p className="text-xs text-muted-foreground mt-2">Be careful, some actions are irreversible!</p>
            </motion.section>

            <div className="mt-8 flex justify-end">
              <motion.div {...buttonHoverTap}>
                <Button onClick={handleSaveChanges} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs md:text-sm">
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
