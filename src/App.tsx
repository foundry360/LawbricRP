import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
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

const routePermissionCache = new Map<string, boolean>();

function getRoutePermissionCacheKey(permissionKeys: string[]) {
  return [...permissionKeys].sort().join("|");
}

function AccessDenied() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">Access Denied</h2>
      <p className="mt-2 text-muted-foreground">You do not have permission to view this page.</p>
    </div>
  );
}

function PermissionGate({
  permission,
  permissions,
  children,
}: {
  permission?: string;
  permissions?: string[];
  children: ReactNode;
}) {
  const permissionKeys = useMemo(() => permissions ?? (permission ? [permission] : []), [permission, permissions]);
  const cacheKey = useMemo(() => getRoutePermissionCacheKey(permissionKeys), [permissionKeys]);
  const [allowed, setAllowed] = useState<boolean | null>(() => (
    routePermissionCache.has(cacheKey) ? routePermissionCache.get(cacheKey)! : null
  ));

  useEffect(() => {
    let cancelled = false;
    const cachedAllowed = routePermissionCache.get(cacheKey);
    if (cachedAllowed !== undefined) {
      setAllowed(cachedAllowed);
      return () => {
        cancelled = true;
      };
    }

    Promise.all(permissionKeys.map((permissionKey) => hasPermission(permissionKey)))
      .then((results) => {
        const nextAllowed = results.some(Boolean);
        routePermissionCache.set(cacheKey, nextAllowed);
        if (!cancelled) setAllowed(nextAllowed);
      })
      .catch(() => {
        routePermissionCache.set(cacheKey, false);
        if (!cancelled) setAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, permissionKeys]);

  if (allowed === null) return <div className="min-h-[50vh]" />;
  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}

function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <Layout>
        <Outlet />
      </Layout>
    </RequireAuth>
  );
}

const CONTACT_VIEW_PERMISSIONS = ["contacts.view_all", "contacts.view_location", "contacts.view_assigned"];
const COMPANY_VIEW_PERMISSIONS = ["contacts.view_all", "contacts.view_location"];
const MATTER_VIEW_PERMISSIONS = ["matters.view_all", "matters.view_assigned", "matters.view_own"];
const LEAD_VIEW_PERMISSIONS = ["leads.view_all", "leads.view_assigned"];

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<AuthenticatedLayout />}>
          <Route
            path="/"
            element={(
              <PermissionGate permissions={CONTACT_VIEW_PERMISSIONS}>
                <Index />
              </PermissionGate>
            )}
          />
          <Route
            path="/contact/:contactId"
            element={(
              <PermissionGate permissions={CONTACT_VIEW_PERMISSIONS}>
                <ContactDetailPage />
              </PermissionGate>
            )}
          />
          <Route
            path="/company/:companyId"
            element={(
              <PermissionGate permissions={COMPANY_VIEW_PERMISSIONS}>
                <CompanyDetailPage />
              </PermissionGate>
            )}
          />
          <Route
            path="/dashboard"
            element={(
              <PermissionGate permission="dashboards.view">
                <PlaceholderPage title="Dashboard" />
              </PermissionGate>
            )}
          />
          <Route
            path="/cases"
            element={(
              <PermissionGate permissions={MATTER_VIEW_PERMISSIONS}>
                <CasesPage />
              </PermissionGate>
            )}
          />
          <Route
            path="/case/:caseId"
            element={(
              <PermissionGate permissions={MATTER_VIEW_PERMISSIONS}>
                <CaseDetailPage />
              </PermissionGate>
            )}
          />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/users/:userId" element={<UserProfilePage />} />
          <Route
            path="/leads"
            element={(
              <PermissionGate permissions={LEAD_VIEW_PERMISSIONS}>
                <LeadsPage />
              </PermissionGate>
            )}
          />
          <Route path="/tools/data" element={<PlaceholderPage title="Data" />} />
          <Route path="/tools/pipelines" element={<PipelinesPage />} />
          <Route path="/billing" element={<PlaceholderPage title="Billing" />} />
          <Route path="/documents" element={<PlaceholderPage title="Documents" />} />
          <Route path="/payments" element={<PlaceholderPage title="Payments" />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
