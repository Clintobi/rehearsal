import { redirect } from "next/navigation";

// Short link for sharing: /start
export default function StartShortLink() {
  redirect("/app/start");
}
