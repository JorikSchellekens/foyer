import type { AccessState, FullLink, ViewerSession } from "@/lib/access";
import {
  AgreementGate,
  BlockedGate,
  EmailGate,
  ExpiredGate,
  PasswordGate,
  VerifySentGate,
  type GateBrand,
} from "@/components/viewer/gates";

/**
 * The gate a visitor still has to pass, rendered in place at whatever URL they
 * arrived on. The data room index and a direct document link share it, so a
 * visitor who opens a document link signs in right there and the same URL then
 * shows the document.
 *
 * `itemId` is the data room document the visitor asked for, when there is one:
 * the email-verification link carries it so the visitor returns to it.
 */
export function AccessGate({
  access,
  link,
  slug,
  brand,
  session,
  itemId,
}: {
  access: Exclude<AccessState, { kind: "granted" }>;
  link: FullLink;
  slug: string;
  brand: GateBrand;
  session: ViewerSession;
  itemId?: string;
}) {
  switch (access.kind) {
    case "expired":
      return <ExpiredGate brand={brand} />;
    case "blocked":
      return (
        <BlockedGate
          slug={slug}
          brand={brand}
          reason={access.reason}
          defaultEmail={session.email ?? ""}
        />
      );
    case "password":
      return <PasswordGate slug={slug} brand={brand} />;
    case "email":
      return (
        <EmailGate
          slug={slug}
          brand={brand}
          requireVerification={access.requireVerification}
          itemId={itemId}
        />
      );
    case "verify-sent":
      return <VerifySentGate brand={brand} email={session.email} />;
    case "agreement":
      return (
        <AgreementGate
          slug={slug}
          brand={brand}
          agreement={{
            name: link.agreement!.name,
            type: link.agreement!.type,
            requireName: link.agreement!.requireName,
            content: link.agreement!.content,
            externalUrl: link.agreement!.externalUrl,
            fileUrl: link.agreement!.fileKey
              ? `/api/view/agreement/${slug}`
              : null,
          }}
        />
      );
  }
}
