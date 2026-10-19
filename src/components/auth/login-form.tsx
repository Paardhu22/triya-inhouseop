"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Eye, EyeOff, User, LogIn } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

type LoginUser = { name: string | null; email: string; role: string };

export function LoginForm({
  callbackUrl,
  users,
}: {
  callbackUrl: string;
  users: LoginUser[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: users[0]?.email ?? "", password: "" },
  });

  const adminUsers = users.filter((u) => u.role === "ADMIN");
  const managerUsers = users.filter((u) => u.role !== "ADMIN");

  async function onSubmit(values: LoginInput) {
    setLoading(true);
    try {
      const res = await signIn("credentials", { ...values, redirect: false });
      if (res?.error) {
        toast.error("Invalid email or password");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => {
            const selectedUser = users.find((u) => u.email === field.value);

            return (
              <FormItem className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Select Account / PG
                  </FormLabel>
                  <span className="text-[11px] text-muted-foreground/80 font-normal">
                    Click to switch PG
                  </span>
                </div>
                <Select value={field.value} onValueChange={field.onChange} disabled={loading}>
                  <FormControl>
                    <SelectTrigger className="w-full h-12 px-3.5 rounded-xl border border-amber-900/15 bg-stone-50/70 hover:bg-stone-50 hover:border-amber-700/30 focus-visible:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500/20 transition-all text-left shadow-2xs cursor-pointer">
                      {selectedUser ? (
                        <div className="flex items-center gap-3 w-full overflow-hidden text-left">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100/90 border border-amber-300/70 text-amber-900 font-semibold text-xs shadow-2xs">
                            {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : <User className="size-3.5 text-amber-800" />}
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {selectedUser.name ?? selectedUser.email}
                            </span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-md uppercase shrink-0",
                                selectedUser.role === "ADMIN"
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : "bg-stone-200/80 text-stone-700 border border-stone-300/70"
                              )}
                            >
                              {selectedUser.role === "ADMIN" ? "Admin" : "PG Manager"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Select an account</span>
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="w-[var(--radix-select-trigger-width)] max-h-80 overflow-y-auto rounded-xl border border-amber-900/15 bg-card/95 backdrop-blur-md shadow-xl p-1.5 z-50"
                  >
                    {adminUsers.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                          Administrator
                        </SelectLabel>
                        {adminUsers.map((user) => (
                          <SelectItem
                            key={user.email}
                            value={user.email}
                            className="rounded-lg px-2.5 py-2 cursor-pointer focus:bg-amber-500/10 focus:text-foreground data-[state=checked]:bg-amber-100/60 transition-colors"
                          >
                            <span className="flex items-center gap-2.5 w-full">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 border border-amber-300/60 text-amber-900 font-semibold text-xs">
                                {user.name ? user.name.charAt(0).toUpperCase() : <User className="size-3.5 text-amber-800" />}
                              </span>
                              <span className="font-medium text-sm text-foreground truncate flex-1 text-left">
                                {user.name ?? user.email}
                              </span>
                              <span className="px-1.5 py-0.5 text-[9px] font-semibold tracking-wider rounded uppercase bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                Admin
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {managerUsers.length > 0 && (
                      <>
                        <SelectSeparator className="my-1 border-amber-900/10" />
                        <SelectGroup>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                            PG Managers (Single PG Access)
                          </SelectLabel>
                          {managerUsers.map((user) => (
                            <SelectItem
                              key={user.email}
                              value={user.email}
                              className="rounded-lg px-2.5 py-2 cursor-pointer focus:bg-amber-500/10 focus:text-foreground data-[state=checked]:bg-amber-100/60 transition-colors"
                            >
                              <span className="flex items-center gap-2.5 w-full">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-stone-100 border border-stone-300/70 text-stone-800 font-semibold text-xs">
                                  {user.name ? user.name.charAt(0).toUpperCase() : <User className="size-3.5 text-stone-600" />}
                                </span>
                                <span className="font-medium text-sm text-foreground truncate flex-1 text-left">
                                  {user.name ?? user.email}
                                </span>
                                <span className="px-1.5 py-0.5 text-[9px] font-semibold tracking-wider rounded uppercase bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
                                  PG Manager
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Select <strong>Triya Admin</strong> for all properties, or a <strong>PG Manager</strong> (Joystayz, Frieden, Cozy) for single-PG operations.
                </p>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                    <Lock className="size-4 text-stone-400" />
                  </div>
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={loading}
                    className="h-12 pl-10 pr-10 rounded-xl border border-amber-900/15 bg-stone-50/70 hover:bg-stone-50 hover:border-amber-700/30 focus-visible:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500/20 transition-all text-sm shadow-2xs"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-stone-700 focus:outline-none transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          Sign in
        </Button>
      </form>
    </Form>
  );
}
