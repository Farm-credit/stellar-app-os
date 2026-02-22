import { Card, CardContent } from "@/components/molecules/Card";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FeaturedProjectCard() {
    return (
        <Card className="overflow-hidden h-full flex flex-col">
            <div className="relative h-40 w-full bg-muted">
                <Image
                    src="/reforestation-project.png"
                    alt="Lush green forest representing reforestation"
                    fill
                    className="object-cover"
                />
                <div className="absolute top-3 left-3">
                    <Badge className="bg-stellar-green text-white border-transparent">
                        Featured Project
                    </Badge>
                </div>
            </div>
            <CardContent className="p-6 flex flex-col flex-1">
                <Text as="h3" variant="h4" className="mb-2">
                    Amazon Reforestation Initiative
                </Text>
                <Text variant="muted" className="mb-6 flex-1 line-clamp-3">
                    Support local communities in restoring deforested areas of the Amazon rainforest. Every $5 donated funds the planting and maintenance of one native tree sapling.
                </Text>

                <Button asChild stellar="primary" className="w-full mt-auto">
                    <Link href="/projects/amazon-reforestation" className="flex items-center justify-center gap-2">
                        Support Project <ArrowRight className="w-4 h-4" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
