"use client";

import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/molecules/Card";
import { cn } from "@/lib/utils";
import { Leaf, DollarSign, PieChart } from "lucide-react";
import Link from "next/link"; // Changed to next/link directly

interface QuickActionsProps {
    className?: string;
}

export function QuickActions({ className }: QuickActionsProps) {
    return (
        <Card className={cn("h-full", className)}>
            <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <Button asChild stellar="primary" className="w-full flex items-center justify-center gap-2 h-14">
                    <Link href="/donate">
                        <DollarSign className="w-5 h-5" />
                        Donate
                    </Link>
                </Button>
                <Button asChild stellar="success" className="w-full flex items-center justify-center gap-2 h-14">
                    <Link href="/credits/marketplace">
                        <Leaf className="w-5 h-5" />
                        Buy Credits
                    </Link>
                </Button>
                <Button asChild variant="outline" className="w-full flex items-center justify-center gap-2 h-14 border-stellar-blue text-stellar-blue hover:bg-stellar-blue/10">
                    <Link href="/dashboard/portfolio">
                        <PieChart className="w-5 h-5" />
                        View Portfolio
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
