import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { supabase } from "../services/supabase";

const AVATAR_BUCKET = "avatars";

const getMimeType = (extension) => {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpeg":
    case "jpg":
    default:
      return "image/jpeg";
  }
};

const getFileExtension = (asset) => {
  const fileNameParts = (asset?.fileName || "").split(".");
  if (fileNameParts.length > 1) return fileNameParts.pop().toLowerCase();

  const mimeType = asset?.mimeType || "";
  return mimeType.includes("/") ? mimeType.split("/")[1].toLowerCase() : "jpg";
};

const base64ToArrayBuffer = (base64) => {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

export default function DiaryAvatar({ accent = "#E94560", isDark = false }) {
  const [userId, setUserId] = useState("");
  const [avatarUri, setAvatarUri] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAvatar = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data?.avatar_path) {
        setAvatarUri("");
        return;
      }

      const { data: signedUrl, error: signedUrlError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(data.avatar_path, 60 * 60);

      if (signedUrlError) throw signedUrlError;
      setAvatarUri(signedUrl.signedUrl);
    } catch (error) {
      console.log("Diary avatar load error:", error);
      setAvatarUri("");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAvatar();
    }, [loadAvatar])
  );

  const handleAvatarPress = async () => {
    try {
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("წვდომა საჭიროა", "პროფილის სურათის ასარჩევად ჩართე ფოტოებზე წვდომა.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setSaving(true);
      const pickedAsset = result.assets[0];
      const extension = getFileExtension(pickedAsset);
      const avatarPath = `${targetUserId}/avatar.${extension}`;
      const base64 = await FileSystem.readAsStringAsync(pickedAsset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(avatarPath, base64ToArrayBuffer(base64), {
          contentType: getMimeType(extension),
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_path: avatarPath })
        .eq("id", targetUserId);

      if (profileError) throw profileError;
      await loadAvatar();
    } catch (error) {
      console.log("Diary avatar save error:", error);
      Alert.alert("შეცდომა", "სურათის ატვირთვა ვერ მოხერხდა.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.82} onPress={handleAvatarPress} style={styles.touchTarget}>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: isDark ? "rgba(233,69,96,0.12)" : "#FFF1F5",
            borderColor: `${accent}55`,
          },
        ]}
      >
        {avatarUri ? (
          <Image source={avatarUri} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Ionicons name="person-outline" size={21} color={accent} />
        )}

        {(loading || saving) && (
          <View style={styles.loader}>
            <ActivityIndicator color="#FFFFFF" size="small" />
          </View>
        )}
      </View>

      <View style={[styles.uploadBadge, { backgroundColor: accent }]}>
        <Ionicons name={avatarUri ? "pencil" : "camera"} size={10} color="#FFFFFF" />
      </View>

      {!avatarUri && !loading && <Text style={[styles.uploadHint, { color: accent }]}>ფოტო</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchTarget: { width: 58, alignItems: "center", position: "relative" },
  avatar: { width: 50, height: 50, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  uploadBadge: { position: "absolute", right: 1, top: 34, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  uploadHint: { fontSize: 9, fontWeight: "800", marginTop: 5 },
});
