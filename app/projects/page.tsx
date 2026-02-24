import Link from 'next/link';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

export default function ProjectsPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <Text variant="h2" as="h1">
          Projects
        </Text>
        <Text variant="muted">
          Explore verified carbon and sustainability projects listed across the platform.
        </Text>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockCarbonProjects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle className="line-clamp-2 text-lg">{project.name}</CardTitle>
              <CardDescription>{project.location}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Text variant="small" className="line-clamp-3 text-muted-foreground">
                {project.description}
              </Text>
              <Button asChild variant="outline" className="w-full">
                <Link href="/marketplace">View in Marketplace</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
