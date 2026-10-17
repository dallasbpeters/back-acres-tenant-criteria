import { authenticated } from "@/lib/adverse/auth";
import { ManagementShell } from "@/components/management/shell";
import { OwnerSignIn } from "@/components/management/sign-in";
import { Dashboard } from "@/components/management/dashboard";
export const dynamic="force-dynamic";
export const metadata={title:"Owner workspace | Back Acres"};
export default async function AdminPage(){return <ManagementShell title="Owner workspace" owner>{await authenticated()?<Dashboard/>:<OwnerSignIn/>}</ManagementShell>;}
