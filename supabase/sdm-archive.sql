-- Arsip kasus SDM; hak akses mengikuti kebijakan update yang sudah ada.
alter table public.sdm_cases add column if not exists deleted_at timestamptz;
