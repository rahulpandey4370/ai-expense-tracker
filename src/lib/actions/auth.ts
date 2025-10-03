'use server';

// This is a server-only file.
// The hardcoded credentials will NOT be sent to the browser.

const APP_EMAIL = process.env.FINWISE_EMAIL;
const APP_PASSWORD = process.env.FINWISE_PASSWORD;

export async function serverLogin(email?: string, password?: string): Promise<{ success: boolean; error?: string }> {
  if (!APP_EMAIL || !APP_PASSWORD) {
    console.error("Authentication environment variables (FINWISE_EMAIL, FINWISE_PASSWORD) are not set.");
    // Do not disclose which variable is missing to the client.
    return { success: false, error: "The application is not configured for authentication. Please contact the administrator." };
  }

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  if (email === APP_EMAIL && password === APP_PASSWORD) {
    return { success: true };
  }

  return { success: false, error: "Invalid credentials." };
}
