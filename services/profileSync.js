import { supabase } from "./supabase";

export async function syncProfileEmailForUser(user) {
  if (!user?.id || !user?.email) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
      },
      { onConflict: "id" }
    );

  if (error) {
    console.log("Profile email sync failed:", error);
  }
}

export async function syncProfileEmailForCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await syncProfileEmailForUser(user);
}
