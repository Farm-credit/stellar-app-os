"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { CheckCircle2, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsCard } from "@/components/molecules/SettingsCard";
import {
  preferencesSchema,
  type PreferencesFormData,
} from "@/schemas/settings.schema";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types/settings";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "de", label: "Deutsch" },
] as const;

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
] as const;

type ThemeOption = {
  value: Theme;
  label: string;
  icon: React.ReactNode;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
  { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
];

export function PreferencesSection() {
  const [saved, setSaved] = useState(false);

  const { handleSubmit, control, formState: { isSubmitting } } =
    useForm<PreferencesFormData>({
      resolver: zodResolver(preferencesSchema),
      defaultValues: {
        language: "en",
        currency: "USD",
        theme: "system",
      },
    });

  const onSubmit = async (data: PreferencesFormData) => {
    await new Promise((r) => setTimeout(r, 800));
    console.log("Preferences saved:", data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <SettingsCard
      title="Preferences"
      description="Set your language, currency, and display theme."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Language */}
        <div className="space-y-1.5">
          <Label htmlFor="language">Language</Label>
          <Controller
            name="language"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="language" className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((cur) => (
                    <SelectItem key={cur.value} value={cur.value}>
                      {cur.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Theme toggle */}
        <div className="space-y-2">
          <Label>Theme</Label>
          <Controller
            name="theme"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                      field.value === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Theme change applies immediately.
          </p>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-stellar-green">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Preferences"
            )}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

PreferencesSection.displayName = "PreferencesSection";