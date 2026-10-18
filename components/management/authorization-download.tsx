"use client";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
export function AuthorizationDownload({ text }: { text: string }) {
  const download = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "back-acres-ach-authorization.txt";
    link.click();
    URL.revokeObjectURL(url);
  }, [text]);
  return <Button onPress={download}>Download authorization copy</Button>;
}
