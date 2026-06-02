import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CalendarPage } from "@/pages/CalendarPage";
import { ContactDetailPage } from "@/pages/ContactDetailPage";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import Index from "@/pages/Index";
import { Login } from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { ResetPassword } from "@/pages/ResetPassword";
import { Toaster } from "@/components/ui/toaster";
import UserManagement from "@/pages/UserManagement";

function AppShell({ title }: { title: string }) {
  return (
    <RequireAuth>
      <Layout>
        <PlaceholderPage title={title} />
      </Layout>
    </RequireAuth>
  );
}

function UsersShell() {
  return (
    <RequireAuth>
      <UserManagement />
    </RequireAuth>
  );
}

function ContactDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <ContactDetailPage />
      </Layout>
    </RequireAuth>
  );
}

function CalendarShell() {
  return (
    <RequireAuth>
      <Layout>
        <CalendarPage />
      </Layout>
    </RequireAuth>
  );
}

function IndexShell() {
  return (
    <RequireAuth>
      <Index />
    </RequireAuth>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<IndexShell />} />
        <Route path="/contact/:contactId" element={<ContactDetailShell />} />
        <Route path="/dashboard" element={<AppShell title="Dashboard" />} />
        <Route path="/cases" element={<AppShell title="Cases" />} />
        <Route path="/calendar" element={<CalendarShell />} />
        <Route path="/tasks" element={<AppShell title="Tasks" />} />
        <Route path="/users" element={<UsersShell />} />
        <Route path="/leads" element={<AppShell title="Leads" />} />
        <Route path="/billing" element={<AppShell title="Billing" />} />
        <Route path="/documents" element={<AppShell title="Documents" />} />
        <Route path="/payments" element={<AppShell title="Payments" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
