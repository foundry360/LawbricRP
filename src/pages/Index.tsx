import { useEffect } from "react";
import { ContactDirectory } from "@/components/ContactDirectory";

export default function Index() {
  useEffect(() => {
    // App configuration is handled by Layout and app-location-context.
  }, []);

  return <ContactDirectory />;
}
