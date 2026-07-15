-- Fertility mode phase 3: daily supplement/vitamin tracking.
-- value shape: { taken: text[] } e.g. { "taken": ["folic", "vitamin_d"] }
alter table public.fertility_logs drop constraint if exists fertility_logs_type_check;

alter table public.fertility_logs add constraint fertility_logs_type_check
  check (type in (
    'intercourse',
    'lh_test',
    'bbt',
    'cervical_mucus',
    'ovulation_symptom',
    'supplement'
  ));

comment on table public.fertility_logs is 'Daily fertility-mode entries. value shape by type: intercourse {protected:bool}, lh_test {result:negative|weak|positive|peak}, bbt {temp:number}, cervical_mucus {mucus:dry|sticky|creamy|watery|eggwhite}, ovulation_symptom {symptoms:text[]}, supplement {taken:text[]}.';
