import { redirect } from "next/navigation";

// Short link for sharing in groups: /call
export default function CallShortLink() {
  redirect("/app/call");
}
