-- Create storage bucket for assets (store images, announcements media)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Ensure public access to assets
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'assets' );

create policy "Authenticated users can upload assets"
  on storage.objects for insert
  with check ( bucket_id = 'assets' and auth.role() = 'authenticated' );

create policy "Authenticated users can update assets"
  on storage.objects for update
  using ( bucket_id = 'assets' and auth.role() = 'authenticated' );

create policy "Authenticated users can delete assets"
  on storage.objects for delete
  using ( bucket_id = 'assets' and auth.role() = 'authenticated' );

-- Announcements Table
create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text not null,
  media_url text,
  is_published boolean default true not null,
  published_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id)
);

-- RLS Policies for Announcements
alter table public.announcements enable row level security;

create policy "Announcements are viewable by all authenticated users"
  on announcements for select
  using ( auth.role() = 'authenticated' and is_published = true );

create policy "Admin and Moderators can manage announcements"
  on announcements for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
      and users.role in ('admin', 'moderator_a1')
    )
  );

-- Function to clean up expired announcements (Optional, run via pg_cron or server)
-- delete from announcements where expires_at < now();
