"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Eye, EyeOff, User, ArrowRight } from "lucide-react";
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
  SelectItem,
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
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Account
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={loading}>
                  <FormControl>
                    <SelectTrigger className="w-full h-13 px-3.5 rounded-xl border border-amber-900/15 bg-stone-50/70 hover:bg-stone-50 hover:border-amber-700/30 focus-visible:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500/20 transition-all text-left shadow-2xs">
                      {selectedUser ? (
                        <div className="flex items-center gap-3 w-full overflow-hidden text-left">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100/90 border border-amber-300/70 text-amber-900 font-semibold text-xs shadow-2xs">
                            {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : <User className="size-4 text-amber-800" />}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
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
                                {selectedUser.role}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {selectedUser.email}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Select an account</span>
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border border-amber-900/15 bg-card/95 backdrop-blur-md shadow-xl p-1.5 min-w-[280px]">
                    {users.map((user) => (
                      <SelectItem
                        key={user.email}
                        value={user.email}
                        className="rounded-lg px-2.5 py-2 cursor-pointer focus:bg-amber-500/10 focus:text-foreground data-[state=checked]:bg-amber-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 border border-amber-300/60 text-amber-900 font-semibold text-xs">
                            {user.name ? user.name.charAt(0).toUpperCase() : <User className="size-3.5 text-amber-800" />}
                          </div>
                          <div className="flex flex-col text-left min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-foreground truncate">
                                {user.name ?? user.email}
                              </span>
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 text-[9px] font-semibold tracking-wider rounded uppercase",
                                  user.role === "ADMIN"
                                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                                    : "bg-stone-100 text-stone-700 border border-stone-200"
                                )}
                              >
                                {user.role}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        <Button
          type="submit"
          className="w-full h-12 rounded-xl bg-gradient-to-r from-stone-900 via-stone-850 to-amber-950 text-amber-100 font-semibold tracking-wide hover:from-stone-800 hover:to-amber-900 shadow-md shadow-stone-900/15 border border-amber-500/20 active:scale-[0.99] transition-all cursor-pointer text-sm"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin text-amber-200" />
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Sign in</span>
              <ArrowRight className="size-4 text-amber-300" />
            </div>
          )}
        </Button>
      </form>
    </Form>
  );
}
