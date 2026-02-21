"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/molecules/SettingsCard";
import {
  notificationsSchema,
  type NotificationsFormData,
} from "@/schemas/settings.schema";

type NotificationItem = {
  id: keyof NotificationsFormData["notifications"];
  label: string;
  description: string;
};

const NOTIFICATION_ITEMS: NotificationItem[] = [
  {
    id: "emailBookings",
    label: "Booking confirmations",
    description: "Receive emails when a booking is confirmed or cancelled.",
  },
  {
    id: "emailMarketing",
    label: "Product updates & news",
    description: "Hear about new features and platform announcements.",
  },
  {
    id: "pushPayments",
    label: "Payment alerts",
    description: "Get notified instantly when a payment is received.",
  },
  {
    id: "pushUpdates",
    label: "Application updates",
    description: "Receive push notifications for status changes.",
  },
  {
    id: "smsAlerts",
    label: "SMS alerts",
    description: "Critical alerts sent directly to your phone number.",
  },
];

export function NotificationSection() {
  const [saved, setSaved] = useState(false);

  const { handleSubmit, control, formState: { isSubmitting } } =
    useForm<NotificationsFormData>({
      resolver: zodResolver(notificationsSchema),
      defaultValues: {
        notifications: {
          emailBookings: true,
          emailMarketing: false,
          pushPayments: true,
          pushUpdates: true,
          smsAlerts: false,
        },
      },
    });

  const onSubmit = async (data: NotificationsFormData) => {
    await new Promise((r) => setTimeout(r, 800));
    console.log("Notifications saved:", data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <SettingsCard
      title="Notification Preferences"
      description="Choose how and when you want to be notified."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-1">
        {NOTIFICATION_ITEMS.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center justify-between py-4 ${
              index < NOTIFICATION_ITEMS.length - 1
                ? "border-b border-border"
                : ""
            }`}
          >
            <div className="space-y-0.5 pr-8">
              <Label htmlFor={item.id} className="text-sm font-medium cursor-pointer">
                {item.label}
              </Label>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Controller
              name={`notifications.${item.id}`}
              control={control}
              render={({ field }) => (
                <Switch
                  id={item.id}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="data-[state=checked]:bg-primary"
                />
              )}
            />
          </div>
        ))}

        <div className="flex items-center justify-end gap-3 pt-4">
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

NotificationSection.displayName = "NotificationSection";