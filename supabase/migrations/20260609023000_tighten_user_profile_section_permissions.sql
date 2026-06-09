begin;

create or replace function public.can_edit_user_profile(target_user_id uuid, section text default 'core')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (select 1 from public.profiles where id = target_user_id)
    and (
      public.is_admin()
      or (
        section = 'core'
        and (
          public.has_permission('user_profiles.edit_all')
          or (
            target_user_id = auth.uid()
            and public.has_permission('user_profiles.edit_own')
          )
          or (
            public.has_permission('user_profiles.edit_attorneys')
            and public.user_has_role(target_user_id, 'attorney')
          )
        )
      )
      or (
        section = 'roles'
        and public.has_permission('user_roles.manage')
      )
      or (
        section = 'permissions'
        and public.has_permission('permissions.manage')
      )
      or (
        section = 'credentials'
        and public.has_permission('user_credentials.manage')
      )
      or (
        section = 'documents'
        and public.has_permission('user_documents.manage')
      )
      or (
        section = 'system_access'
        and public.has_permission('system_access.manage')
      )
    );
$$;

drop policy if exists "user_documents_storage_select" on storage.objects;
create policy "user_documents_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'user-documents'
  and exists (
    select 1
    from public.user_documents ud
    where ud.storage_bucket = bucket_id
      and ud.storage_path = name
      and (
        public.is_admin()
        or ud.user_id = auth.uid()
        or public.has_permission('user_profiles.view_all')
        or (
          public.has_permission('user_profiles.view_attorneys')
          and public.user_has_role(ud.user_id, 'attorney')
        )
      )
  )
);

revoke all on function public.can_edit_user_profile(uuid, text) from public;
grant execute on function public.can_edit_user_profile(uuid, text) to authenticated;

commit;
