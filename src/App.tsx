import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CalendarPage } from "@/pages/CalendarPage";
import { CaseDetailPage } from "@/pages/CaseDetailPage";
import { CasesPage } from "@/pages/CasesPage";
import { CompanyDetailPage } from "@/pages/CompanyDetailPage";
import { ContactDetailPage } from "@/pages/ContactDetailPage";
import { Layout } from "@/components/Layout";
import { LeadsPage } from "@/pages/LeadsPage";
import { RequireAuth } from "@/components/RequireAuth";
import Index from "@/pages/Index";
import { Login } from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { PipelinesPage } from "@/pages/PipelinesPage";
import { ResetPassword } from "@/pages/ResetPassword";
import { TasksPage } from "@/pages/TasksPage";
import { Toaster } from "@/components/ui/toaster";
import UserManagement from "@/pages/UserManagement";
import { UserProfilePage } from "@/pages/UserProfilePage";
import { hasPermission } from "@/lib/api";

function PermissionGate({
  permission,
  permissions,
  children,
}: {
  permission?: string;
  permissions?: string[];
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const permissionKeys = permissions ?? (permission ? [permission] : []);

    Promise.all(permissionKeys.map((permissionKey) => hasPermission(permissionKey)))
      .then((results) => {
        if (!cancelled) setAllowed(results.some(Boolean));
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [permission, permissions]);

  if (allowed === null) return <PlaceholderPage title="Loading" />;
  if (!allowed) return <PlaceholderPage title="Access Denied" />;
  return <>{children}</>;
}

function AppShell({ title }: { title: string }) {
  return (
    <RequireAuth>
      <Layout>
        <PlaceholderPage title={title} />
      </Layout>
    </RequireAuth>
  );
}

function DashboardShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permission="dashboards.view">
          <PlaceholderPage title="Dashboard" />
        </PermissionGate>
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

function UserProfileShell() {
  return (
    <RequireAuth>
      <Layout>
        <UserProfilePage />
      </Layout>
    </RequireAuth>
  );
}

function ContactDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permissions={["contacts.view_all", "contacts.view_location", "contacts.view_assigned"]}>
          <ContactDetailPage />
        </PermissionGate>
      </Layout>
    </RequireAuth>
  );
}

function CompanyDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permissions={["contacts.view_all", "contacts.view_location"]}>
          <CompanyDetailPage />
        </PermissionGate>
      </Layout>
    </RequireAuth>
  );
}

function CasesShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permissions={["matters.view_all", "matters.view_assigned", "matters.view_own"]}>
          <CasesPage />
        </PermissionGate>
      </Layout>
    </RequireAuth>
  );
}

function LeadsShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permissions={["leads.view_all", "leads.view_assigned"]}>
          <LeadsPage />
        </PermissionGate>
      </Layout>
    </RequireAuth>
  );
}

function CaseDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <PermissionGate permissions={["matters.view_all", "matters.view_assigned", "matters.view_own"]}>
          <CaseDetailPage />
        </PermissionGate>
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

function TasksShell() {
  return (
    <RequireAuth>
      <Layout>
        <TasksPage />
      </Layout>
    </RequireAuth>
  );
}

function PipelinesShell() {
  return (
    <RequireAuth>
      <Layout>
        <PipelinesPage />
      </Layout>
    </RequireAuth>
  );
}

function IndexShell() {
  return (
    <RequireAuth>
      <PermissionGate permissions={["contacts.view_all", "contacts.view_location", "contacts.view_assigned"]}>
        <Index />
      </PermissionGate>
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
        <Route path="/company/:companyId" element={<CompanyDetailShell />} />
        <Route path="/dashboard" element={<DashboardShell />} />
        <Route path="/cases" element={<CasesShell />} />
        <Route path="/case/:caseId" element={<CaseDetailShell />} />
        <Route path="/calendar" element={<CalendarShell />} />
        <Route path="/tasks" element={<TasksShell />} />
        <Route path="/users" element={<UsersShell />} />
        <Route path="/users/:userId" element={<UserProfileShell />} />
        <Route path="/leads" element={<LeadsShell />} />
        <Route path="/tools/data" element={<AppShell title="Data" />} />
        <Route path="/tools/pipelines" element={<PipelinesShell />} />
        <Route path="/billing" element={<AppShell title="Billing" />} />
        <Route path="/documents" element={<AppShell title="Documents" />} />
        <Route path="/payments" element={<AppShell title="Payments" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
