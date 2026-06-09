begin;

insert into public.permissions (key, name, category, description)
values
  ('matters.view_own', 'View Own Matters', 'matters', 'View matters where the user is the owner or creator.'),
  ('matters.view_assigned', 'View Assigned Matters', 'matters', 'View matters assigned to the user.'),
  ('matters.view_all', 'View All Matters', 'matters', 'View every matter available to the firm.'),
  ('matters.create', 'Create Matters', 'matters', 'Create new matters.'),
  ('matters.edit', 'Edit Matters', 'matters', 'Update matter details, stage, and status.'),
  ('matters.delete', 'Delete Matters', 'matters', 'Delete matters from the system.'),
  ('matters.assign', 'Assign Matters', 'matters', 'Assign lead, source, and other matter responsibilities.'),
  ('contacts.view_assigned', 'View Assigned Contacts', 'contacts', 'View contacts assigned to the user.'),
  ('contacts.view_location', 'View Location Contacts', 'contacts', 'View contacts within assigned locations.'),
  ('contacts.view_all', 'View All Contacts', 'contacts', 'View every contact available to the firm.'),
  ('contacts.create', 'Create Contacts', 'contacts', 'Create new contacts.'),
  ('contacts.edit', 'Edit Contacts', 'contacts', 'Update contact details.'),
  ('contacts.delete', 'Delete Contacts', 'contacts', 'Delete contacts from the system.'),
  ('leads.view_assigned', 'View Assigned Leads', 'leads', 'View leads assigned to the user.'),
  ('leads.view_all', 'View All Leads', 'leads', 'View every lead available to the firm.'),
  ('leads.create', 'Create Leads', 'leads', 'Create new leads.'),
  ('leads.edit', 'Edit Leads', 'leads', 'Update lead details and pipeline stage.'),
  ('leads.convert', 'Convert Leads', 'leads', 'Convert leads into matters.'),
  ('leads.delete', 'Delete Leads', 'leads', 'Delete leads from the system.'),
  ('dashboards.view', 'View Dashboards', 'dashboards', 'Access operational dashboards.'),
  ('dashboards.view_team', 'View Team Dashboards', 'dashboards', 'Access team-level dashboard data.'),
  ('dashboards.view_financials', 'View Financial Dashboards', 'dashboards', 'Access financial dashboard widgets.'),
  ('dashboards.manage', 'Manage Dashboards', 'dashboards', 'Configure dashboard views and widgets.')
on conflict (key) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = any (
  case roles.key
    when 'admin' then array[
      'matters.view_own',
      'matters.view_assigned',
      'matters.view_all',
      'matters.create',
      'matters.edit',
      'matters.delete',
      'matters.assign',
      'contacts.view_assigned',
      'contacts.view_location',
      'contacts.view_all',
      'contacts.create',
      'contacts.edit',
      'contacts.delete',
      'leads.view_assigned',
      'leads.view_all',
      'leads.create',
      'leads.edit',
      'leads.convert',
      'leads.delete',
      'dashboards.view',
      'dashboards.view_team',
      'dashboards.view_financials',
      'dashboards.manage'
    ]
    when 'managing_partner' then array[
      'matters.view_assigned',
      'matters.view_all',
      'matters.create',
      'matters.edit',
      'matters.assign',
      'contacts.view_location',
      'contacts.view_all',
      'contacts.create',
      'contacts.edit',
      'leads.view_all',
      'leads.create',
      'leads.edit',
      'leads.convert',
      'dashboards.view',
      'dashboards.view_team'
    ]
    when 'attorney' then array[
      'matters.view_own',
      'matters.view_assigned',
      'matters.create',
      'matters.edit',
      'contacts.view_assigned',
      'contacts.create',
      'contacts.edit',
      'leads.view_assigned',
      'leads.create',
      'leads.convert',
      'dashboards.view'
    ]
    when 'staff' then array[
      'matters.view_assigned',
      'contacts.view_assigned',
      'contacts.create',
      'leads.view_assigned',
      'dashboards.view'
    ]
    else array[]::text[]
  end
)
on conflict do nothing;

commit;
