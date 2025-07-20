
"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import { AtSign, Briefcase, Cpu, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from 'next/link';

const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4 } },
};

const glowClass = "shadow-[0_0_8px_hsl(var(--accent)/0.3)] dark:shadow-[0_0_10px_hsl(var(--accent)/0.5)]";

const features = [
  "Interactive Dashboard: At-a-glance overview of income, expenses, savings, and investments.",
  "Versatile Transaction Input: Add transactions via single entry, bulk paste, natural language text, or by scanning a receipt.",
  "AI Spending Insights: Receive AI-generated advice based on your monthly spending habits.",
  "AI Financial Chatbot: Ask questions about your transactions in natural language and get instant answers.",
  "Comprehensive Reports: Visualize expenses by category and payment method, with AI-powered comparative analysis.",
  "Yearly Overview: A dedicated page for a month-by-month summary of your financial year.",
  "Split Expenses: Easily manage and track shared expenses with friends.",
  "Goal Planner: Define financial goals, get AI-powered feasibility forecasts, and track your progress.",
  "Modern & Responsive UI: Built with Next.js, ShadCN UI, and Tailwind CSS for a seamless experience on any device."
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background/80 backdrop-blur-sm">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <motion.div
          variants={pageVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className={cn("shadow-xl border-primary/20 border-2 rounded-xl bg-card/90", glowClass)}>
            <CardHeader className="text-center items-center">
              <motion.div variants={itemVariants} className="mb-4">
                <AppLogo className="text-5xl justify-center" />
              </motion.div>
              <motion.div variants={itemVariants}>
                <CardTitle className="text-3xl md:text-4xl font-bold text-primary">
                  About FinWise AI
                </CardTitle>
                <CardDescription className="text-base md:text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
                  An intelligent, AI-powered expense tracking application designed to make personal finance management intuitive, insightful, and efficient.
                </CardDescription>
              </motion.div>
            </CardHeader>
            <CardContent className="space-y-8">
              <motion.section
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                className="mt-6"
              >
                <h2 className="text-2xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <Cpu className="text-accent h-6 w-6" /> Core Features
                </h2>
                <ul className="space-y-3">
                  {features.map((feature, index) => (
                    <motion.li
                      key={index}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: { opacity: 0, x: -20 },
                        visible: { opacity: 1, x: 0, transition: { delay: index * 0.05 } },
                      }}
                      className="flex items-start gap-3"
                    >
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{feature}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.section>

              <motion.section
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.1 } }
                }}
                className="text-center pt-8 border-t border-primary/20"
              >
                <motion.h2 variants={itemVariants} className="text-2xl font-semibold text-primary mb-2">
                  Created By
                </motion.h2>
                <motion.p variants={itemVariants} className="text-xl font-medium text-accent">
                  Rahul Pandey
                </motion.p>
                <motion.p variants={itemVariants} className="text-muted-foreground max-w-xl mx-auto mt-2">
                  I built this application to explore the capabilities of modern web technologies and generative AI in a practical, real-world scenario. It serves as a comprehensive project showcasing my skills in full-stack development, UI/UX design, and AI integration.
                </motion.p>
                <motion.div
                  variants={itemVariants}
                  className="flex justify-center items-center gap-4 mt-6"
                >
                  <Button asChild>
                    <Link href="https://rahul-pandey-ai-portfolio.vercel.app/" target="_blank" rel="noopener noreferrer">
                      <Briefcase className="mr-2 h-4 w-4" /> My Portfolio
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="mailto:rahulpandey.22112002@gmail.com">
                      <AtSign className="mr-2 h-4 w-4" /> Contact Me
                    </a>
                  </Button>
                </motion.div>
              </motion.section>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
