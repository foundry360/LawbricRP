import { useEffect } from "react";
import { ContactDirectory } from "@/components/ContactDirectory";
import { Layout } from "@/components/Layout";

export default function Index() {
  useEffect(() => {
    // App configuration is handled by Layout and app-location-context.
  }, []);

  return (
    <Layout>
      <ContactDirectory />
    </Layout>
  );
}
