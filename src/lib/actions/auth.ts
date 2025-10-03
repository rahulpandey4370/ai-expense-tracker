
'use server';

// This is a server-only file.
// The hardcoded credentials will NOT be sent to the browser.

const HARDCODED_EMAIL = "rahul@example.com";
const HARDCODED_PASSWORD = "finwise_@i";

export async function serverLogin(email?: string, password?: string): Promise<{ success: boolean; error?: string }> {
  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  if (email === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
    return { success: true };
  }

  return { success: false, error: "Invalid credentials." };
}
