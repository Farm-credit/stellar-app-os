'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProposalList } from './ProposalList';
import { CreateProposalForm } from './CreateProposalForm';
import { Plus, Vote } from 'lucide-react';

export function SpeciesGovernance() {
  const [activeTab, setActiveTab] = useState('proposals');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Species Governance</h1>
          <p className="text-muted-foreground mt-2">
            Propose and vote for new tree species to add to the catalogue
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="proposals" className="flex items-center gap-2">
            <Vote className="h-4 w-4" />
            Proposals
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Proposal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Proposals</CardTitle>
              <CardDescription>
                Vote on proposed species additions. Voting power is proportional to your TREE token holdings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProposalList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Propose New Species</CardTitle>
              <CardDescription>
                Submit a new tree species for community review. Include CO₂ sequestration data and maturity information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateProposalForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
