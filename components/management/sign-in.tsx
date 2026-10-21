// biome-ignore-all lint/performance/noJsxPropsBind: Native and React Aria controls are not memoized app children; local event/render callbacks intentionally capture the current form or row values.
"use client";

import {
  Card,
  CardPreview,
  Content,
  Image,
  Text,
} from "@react-spectrum/s2/Card";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

import GoogleLogo from "../ui/google-logo";

export function OwnerSignIn() {
  return (
    <Card
      size="XL"
      UNSAFE_className="section-card"
      UNSAFE_style={{
        backgroundColor: "var(--paper)",
        containerType: "inline-size",
        minInlineSize: 400,
        width: "100%",
      }}
    >
      <CardPreview
        UNSAFE_style={{
          maxBlockSize: 200,
        }}
      >
        <Image src="/shaders/clouds.jpeg" />
      </CardPreview>
      <Content>
        <Text>Sign in with an approved owner Google account.</Text>
        <Button
          className="submit-button"
          onClick={() => signIn("google", { callbackUrl: "/admin" })}
          type="submit"
        >
          <GoogleLogo />
          Continue with Google
        </Button>
      </Content>
    </Card>
  );
}
