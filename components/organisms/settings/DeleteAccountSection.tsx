"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingsCard } from "@/components/molecules/SettingsCard";

const CONFIRM_TEXT = "delete my account";

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = input.toLowerCase() === CONFIRM_TEXT;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    await new Promise((r) => setTimeout(r, 1500));
    console.log("Account deleted");
    setIsDeleting(false);
    setOpen(false);
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) setInput("");
  };

  return (
    <SettingsCard
      variant="danger"
      title="Danger Zone"
      description=""
    >
      <div className="flex flex-col gap-3 ">
        <div>
          <p className="text-sm font-medium text-foreground">Delete Account</p>
          <p className="text-sm text-muted-foreground">
            Permanently delete your account, all data, and access. This cannot
            be undone.
          </p>
        </div>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              className="shrink-0 sm:w-50 mt-4 "
            >
              Delete Account
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-left">Delete Account</DialogTitle>
                  <DialogDescription className="text-left">
                    This action is permanent and cannot be undone.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Your account, all associated data, loan history, and access will
                be permanently removed from FarmCredit. There is no way to
                recover this.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-delete" className="text-sm">
                  Type{" "}
                  <span className="font-semibold text-foreground">
                    {CONFIRM_TEXT}
                  </span>{" "}
                  to confirm
                </Label>
                <Input
                  id="confirm-delete"
                  placeholder={CONFIRM_TEXT}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="border-border"
                  autoComplete="off"
                />
              </div>
            </div>

            <DialogFooter className="gap-3">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!isConfirmed || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete My Account"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsCard>
  );
}

DeleteAccountSection.displayName = "DeleteAccountSection";