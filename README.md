
# FinWise AI - Intelligent Expense Tracker

Welcome to FinWise AI, my personal AI-powered expense tracking application! I built this to make managing personal finances intuitive, insightful, and maybe even a little fun. It leverages modern web technologies and AI to help understand spending patterns, input transactions effortlessly, and gain valuable financial insights.

## Core Features

*   **Interactive Dashboard:** Get an at-a-glance overview of your current month's income, expenses, savings, investment percentage, and cashback/interest earnings.
*   **Versatile Transaction Input:**
    *   **Single Entry:** Quickly add individual income or expense transactions with detailed category and payment method information.
    *   **Bulk Paste (Excel-like):** Efficiently import multiple transactions by pasting tab-separated data directly from a spreadsheet.
    *   **AI Text Input:** Type or paste transactions in natural language (e.g., "Lunch at Cafe Express ₹500 with HDFC CC yesterday"), and let the AI parse and structure them for you.
    *   **AI Receipt Scan:** Upload a receipt image, and the AI will extract details like vendor, amount, date, and suggest a category.
*   **AI Spending Insights:** Receive AI-generated insights and advice based on your monthly spending habits and comparisons with the previous month.
*   **AI Financial Chatbot:** Ask questions about your transactions in natural language (e.g., "What was my total spending on groceries this month?") and get AI-powered answers.
*   **Comprehensive Reports:**
    *   Visualize expenses by category and payment method for selected periods (monthly or annual).
    *   View trends for monthly spending and income vs. expenses.
    *   Generate AI-powered comparative analysis between different periods.
    *   Export reports to PDF.
*   **Yearly Overview:** A dedicated page to see a month-by-month summary of your income, spending, savings, investments, and cashbacks/interests for a selected year, complete with insightful charts.
*   **Categorization & Payment Methods:** Pre-defined and customizable lists for expense/income categories and payment methods.
*   **Settings:** Configure application preferences, including theme (light/dark mode).
*   **Responsive Design:** Smooth experience across desktop and mobile devices.
*   **Modern UI/UX:** Built with ShadCN UI components and Tailwind CSS for a clean, accessible, and aesthetically pleasing interface, enhanced with Framer Motion animations.

## Technology Stack

*   **Frontend:**
    *   [Next.js](https://nextjs.org/) (App Router)
    *   [React](https://reactjs.org/)
    *   [TypeScript](https://www.typescriptlang.org/)
*   **UI Components & Styling:**
    *   [ShadCN UI](https://ui.shadcn.com/)
    *   [Tailwind CSS](https://tailwindcss.com/)
    *   [Framer Motion](https://www.framer.com/motion/) (for animations)
    *   [Lucide React](https://lucide.dev/) (for icons)
    *   [Recharts](https://recharts.org/) (for charts, via ShadCN UI)
*   **Artificial Intelligence:**
    *   [Genkit (by Google)](https://firebase.google.com/docs/genkit) - Used for defining and running AI flows.
    *   Google Gemini 2.0 Flash model for insights, NLP parsing, and chatbot functionality.
*   **Data Storage:**
    *   [Vercel Blob](https://vercel.com/storage/blob) - For storing transaction data, categories, and payment methods as JSON files.
*   **Deployment:**
    *   [Vercel](https://vercel.com/)

## Getting Started

Follow these instructions to get a local copy up and running for development and testing.

### Prerequisites

*   Node.js (v18 or newer recommended)
*   npm or yarn or pnpm
*   A Vercel account (for Vercel Blob storage and deployment)
*   A Google Cloud Project with the Generative Language API enabled (for AI features)

### Setup Instructions

1.  **Clone the Repository:**
    ```bash
    git clone https://your-repository-url/finwise-ai.git
    cd finwise-ai
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    # or
    # pnpm install
    ```

3.  **Set Up Environment Variables:**
    *   Create a `.env` file in the root of your project by copying `.env.example` (if one exists) or creating it from scratch.
    *   **Vercel Blob Token:**
        *   Create a Blob store in your Vercel project settings (Storage tab).
        *   Vercel will provide a `BLOB_READ_WRITE_TOKEN`. Add this to your `.env` file:
            ```env
            BLOB_READ_WRITE_TOKEN="vercel_blob_rw_YOUR_ACTUAL_TOKEN"
            ```
        *   For local development, pull this environment variable using the Vercel CLI:
            ```bash
            vercel env pull .env.development.local
            ```
            (Ensure you're logged in to Vercel CLI and have linked the project: `vercel login` and `vercel link`)
    *   **Google API Key (for Genkit AI features):**
        *   Go to your Google Cloud Console, select your project, and navigate to "APIs & Services" > "Credentials".
        *   Create an API key if you don't have one. Ensure the "Generative Language API" (sometimes listed as "Vertex AI API" or similar, depending on the model access) is enabled for your project and this key.
        *   Add it to your `.env` file:
            ```env
            GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
            ```

4.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    The application should now be running on `http://localhost:9002` (or the port specified in your `package.json`).

5.  **Run Genkit Development Server (for AI features):**
    In a separate terminal, run:
    ```bash
    npm run genkit:dev
    # or for auto-reloading on changes
    # npm run genkit:watch
    ```
    This starts the Genkit development server, typically on port 3400, which your Next.js app will call for AI flows.

### Using the Application

*   **Dashboard:** View your monthly financial summary.
*   **Add Transactions:**
    *   Use the "Single Entry" tab for individual transactions.
    *   Use "Bulk Paste" by copying tab-separated data from a spreadsheet (Format: Description, Category, Amount, Ignored Total Amount, Date (DD/MM/YYYY), Expense Type, Payment Method).
    *   Use "AI Text Input" to type transactions naturally. Review AI suggestions before submitting.
    *   Use "AI Receipt Scan" to upload a receipt image for automatic parsing.
*   **Transactions Page:** View, filter, sort, edit, and delete your transactions. Export to CSV.
*   **Reports Page:** Analyze spending by category and payment method. Generate AI comparative analysis. Export reports to PDF.
*   **Yearly Overview Page:** See a month-by-month financial breakdown for any selected year.
*   **Settings Page:** Toggle between light and dark themes.

## Data Persistence

*   **Categories and Payment Methods:** Stored as `categories.json` and `payment-methods.json` in your Vercel Blob store (`internal/data/` path). If these files are not found on the first run, they are initialized with default values from `src/lib/data.ts`.
*   **Transactions:** Each transaction is stored as an individual JSON file (e.g., `transactions/<id>.json`) in your Vercel Blob store. Three mock transactions are created if the `transactions/` path is empty on the first data fetch.

## Contributing

As this is a personal project I built, contributions are not actively sought at this moment. However, feel free to fork the repository and explore!

## License

This project is open-source and available under the [MIT License](LICENSE.md) (if you choose to add one).

---

I hope you find FinWise AI useful for managing your finances! I had a lot of fun building it and exploring the capabilities of AI in a practical application.
