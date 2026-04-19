import { useParams } from "wouter";
import AdminPostForm from "./AdminPostForm";

export default function AdminEditPost() {
  const params = useParams<{ id: string }>();
  const postId = params.id ? Number(params.id) : undefined;
  return <AdminPostForm postId={postId} />;
}
