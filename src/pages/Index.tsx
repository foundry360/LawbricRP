import { useEffect } from "react";
import { ContactDirectory } from "@/components/ContactDirectory";
import { Layout } from "@/components/Layout";

export default function Index() {
  useEffect(() => {
    // App configuration is handled by Layout and app-location-context.
  }, []);

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
        <ContactDirectory />
      </div>
    </Layout>
  );
}
