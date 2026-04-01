"use client";

import { use } from "react";
import { BookReader } from "@/components/reader/book-reader";

export default function BookReaderPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);

  return <BookReader bookId={bookId} />;
}
