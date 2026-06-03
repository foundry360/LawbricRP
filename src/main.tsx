import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";

function AppLoadError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "The app failed to load.";
  const isMissingSupabaseEnv = message.includes("Missing VITE_SUPABASE_URL");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-900">
      <div className="max-w-lg rounded-xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Lawbric could not load</h1>
        <p className="mt-3 text-sm text-gray-600">
          {isMissingSupabaseEnv
            ? "Vercel is missing the Supabase environment variables required to start the app."
            : message}
        </p>
        {isMissingSupabaseEnv ? (
          <p className="mt-3 text-sm text-gray-600">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the Vercel project,
            then redeploy.
          </p>
        ) : null}
      </div>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

void import("./App")
  .then(({ App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(<AppLoadError error={error} />);
  });
