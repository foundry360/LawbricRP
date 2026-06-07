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

function CompanyDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <CompanyDetailPage />
      </Layout>
    </RequireAuth>
  );
}

function CasesShell() {
  return (
    <RequireAuth>
      <Layout>
        <CasesPage />
      </Layout>
    </RequireAuth>
  );
}

function LeadsShell() {
  return (
    <RequireAuth>
      <Layout>
        <LeadsPage />
      </Layout>
    </RequireAuth>
  );
}

function CaseDetailShell() {
  return (
    <RequireAuth>
      <Layout>
        <CaseDetailPage />
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
        <Route path="/company/:companyId" element={<CompanyDetailShell />} />
        <Route path="/dashboard" element={<AppShell title="Dashboard" />} />
        <Route path="/cases" element={<CasesShell />} />
        <Route path="/case/:caseId" element={<CaseDetailShell />} />
        <Route path="/calendar" element={<CalendarShell />} />
        <Route path="/tasks" element={<TasksShell />} />
        <Route path="/users" element={<UsersShell />} />
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
