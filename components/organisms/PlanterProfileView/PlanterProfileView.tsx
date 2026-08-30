'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Languages,
  CalendarDays,
  Award,
  HeartHandshake,
  UserPlus,
  UserCheck,
  TreePine,
  Users,
  TrendingUp,
  CheckCircle2,
  Twitter,
  Linkedin,
  Instagram,
  Clock,
  Send,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/molecules/Card';
import { usePlanterConnections } from '@/hooks/usePlanterConnections';
import { cn } from '@/lib/utils';
import type { PlanterProfile } from '@/lib/types/planter';

interface PlanterProfileViewProps {
  planter: PlanterProfile;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stellar-blue/10 bg-background/60 p-4 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-stellar-blue/10 text-stellar-blue">
        {icon}
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
    </div>
  );
}

export function PlanterProfileView({ planter }: PlanterProfileViewProps) {
  const router = useRouter();
  const { isConnected, connect, removeConnection } = usePlanterConnections();
  const connected = isConnected(planter.id);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    setSent(true);
  };

  const socialIcons: {
    key: keyof NonNullable<PlanterProfile['socialLinks']>;
    icon: React.ReactNode;
  }[] = [
    { key: 'twitter', icon: <Twitter className="h-4 w-4" /> },
    { key: 'linkedin', icon: <Linkedin className="h-4 w-4" /> },
    { key: 'instagram', icon: <Instagram className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Nav */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => router.push('/planters')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All Planters
        </Button>
      </div>

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-stellar-blue/10">
        <div className="h-40 w-full bg-gradient-to-r from-stellar-green to-stellar-blue" />
        <div className="bg-card px-6 pb-6 sm:px-10">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl ring-4 ring-card">
                {planter.avatarUrl ? (
                  <Image
                    src={planter.avatarUrl}
                    alt={planter.fullName}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-3xl font-bold text-muted-foreground">
                    {planter.fullName.charAt(0)}
                  </div>
                )}
              </div>
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Text as="h1" variant="h3" className="font-bold">
                    {planter.fullName}
                  </Text>
                  {planter.isFeatured && <Badge variant="success">Featured</Badge>}
                  {planter.availableForConnections ? (
                    <Badge variant="accent">
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
                      Available to connect
                    </Badge>
                  ) : (
                    <Badge variant="secondary">At capacity</Badge>
                  )}
                </div>
                <Text className="font-semibold text-stellar-blue">{planter.role}</Text>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {planter.location}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Languages className="h-3.5 w-3.5" aria-hidden /> {planter.languages.join(', ')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Joined since{' '}
                    {new Date(planter.joinedDate).getFullYear()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pb-1">
              {planter.availableForConnections ? (
                <Button
                  stellar={connected ? 'success-outline' : 'primary'}
                  onClick={() => (connected ? removeConnection(planter.id) : connect(planter.id))}
                  aria-pressed={connected}
                  size="sm"
                >
                  {connected ? (
                    <>
                      <UserCheck className="h-4 w-4" aria-hidden /> Connected
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" aria-hidden /> Connect with {planter.firstName}
                    </>
                  )}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Not accepting connections
                </Button>
              )}
              {planter.socialLinks && (
                <div className="flex items-center gap-1">
                  {socialIcons
                    .filter(({ key }) => planter.socialLinks?.[key])
                    .map(({ key, icon }) => (
                      <a
                        key={key}
                        href={planter.socialLinks?.[key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground hover:border-stellar-blue/40 hover:text-stellar-blue"
                        aria-label={`${planter.firstName} on ${key}`}
                      >
                        {icon}
                      </a>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat
          icon={<TreePine className="h-5 w-5" />}
          label="Trees planted"
          value={planter.stats.treesPlanted.toLocaleString()}
        />
        <Stat
          icon={<Users className="h-5 w-5" />}
          label="Projects"
          value={String(planter.stats.projectsJoined)}
        />
        <Stat
          icon={<CalendarDays className="h-5 w-5" />}
          label="Years experience"
          value={String(planter.stats.yearsExperience)}
        />
        <Stat
          icon={<TrendingUp className="h-5 w-5" />}
          label="Survival rate"
          value={planter.stats.survivalRate !== null ? `${planter.stats.survivalRate}%` : '—'}
        />
        <Stat
          icon={<HeartHandshake className="h-5 w-5" />}
          label="Community engaged"
          value={planter.stats.communityMembersEngaged.toLocaleString()}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-8 lg:col-span-2">
          {/* Background */}
          <section>
            <Text variant="h4" as="h2" className="mb-3 font-bold">
              About {planter.firstName}
            </Text>
            <p className="text-muted-foreground leading-relaxed">{planter.background}</p>
          </section>

          {/* Expertise */}
          <section>
            <Text variant="h4" as="h2" className="mb-3 font-bold">
              Expertise
            </Text>
            <div className="flex flex-wrap gap-2">
              {planter.expertise.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stellar-blue/20 bg-stellar-blue/5 px-3 py-1.5 text-sm font-medium text-stellar-blue"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* Community work */}
          <section>
            <Text variant="h4" as="h2" className="mb-4 flex items-center gap-2 font-bold">
              <HeartHandshake className="h-5 w-5 text-stellar-green" aria-hidden /> Community work
            </Text>
            <div className="space-y-4">
              {planter.communityWork.map((work) => (
                <Card key={work.title} className="rounded-2xl">
                  <CardContent className="space-y-1.5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Text className="font-semibold">{work.title}</Text>
                      {work.since && <Badge variant="secondary">Since {work.since}</Badge>}
                    </div>
                    <Text variant="muted" className="text-sm">
                      {work.description}
                    </Text>
                    {work.link && (
                      <a
                        href={work.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-sm font-medium text-stellar-blue"
                      >
                        Learn more
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Certifications */}
          <section>
            <Text variant="h4" as="h2" className="mb-3 flex items-center gap-2 font-bold">
              <Award className="h-5 w-5 text-amber-500" aria-hidden /> Certifications
            </Text>
            <ul className="space-y-2">
              {planter.certifications.map((cert) => (
                <li key={cert} className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-stellar-green"
                    aria-hidden
                  />
                  {cert}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Connect panel */}
          <Card className="rounded-2xl border-stellar-blue/10">
            <CardHeader>
              <CardTitle className="text-base">
                {connected
                  ? `Connected with ${planter.firstName}`
                  : `Connect with ${planter.firstName}`}
              </CardTitle>
              <CardDescription>
                {planter.availableForConnections
                  ? `Reach out to learn more about ${planter.firstName}'s work or ask a question about your trees.`
                  : `${planter.firstName} is not accepting new connections right now.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {planter.responseTime && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-stellar-blue" aria-hidden />
                  {planter.responseTime}
                </div>
              )}

              {sent ? (
                <div className="rounded-xl bg-stellar-green/10 p-4 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-stellar-green" aria-hidden />
                  <Text variant="small" className="font-medium text-stellar-green">
                    Message sent to {planter.firstName}! Watch your inbox for a reply.
                  </Text>
                </div>
              ) : (
                <>
                  <label htmlFor="planter-message" className="text-sm font-medium">
                    Send {planter.firstName} a message
                  </label>
                  <textarea
                    id="planter-message"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Hi ${planter.firstName}, I sponsor trees on your project…`}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      stellar={connected ? 'success-outline' : 'primary'}
                      onClick={handleSendMessage}
                      disabled={!message.trim() || !planter.availableForConnections}
                      className="flex-1 gap-2"
                      size="sm"
                    >
                      <Send className="h-4 w-4" aria-hidden /> Send message
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(connected ? '' : '')}
                      onClick={() =>
                        connected ? removeConnection(planter.id) : connect(planter.id)
                      }
                    >
                      {connected ? 'Disconnect' : 'Follow'}
                    </Button>
                  </div>
                  {!planter.availableForConnections && (
                    <Text variant="small" className="text-muted-foreground">
                      Messaging is paused while {planter.firstName} is at capacity.
                    </Text>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card className="rounded-2xl border-stellar-blue/10">
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>Where {planter.firstName} is making an impact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {planter.associatedProjects.map((project) => (
                <div
                  key={project}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                >
                  <TreePine className="h-4 w-4 shrink-0 text-stellar-green" aria-hidden />
                  {project}
                  <Link
                    href="/projects"
                    className="ml-auto font-medium text-stellar-blue hover:underline"
                  >
                    View
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
