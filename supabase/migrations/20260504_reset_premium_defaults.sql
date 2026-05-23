update profiles
set is_premium = false
where coalesce(is_premium, false) = true;
