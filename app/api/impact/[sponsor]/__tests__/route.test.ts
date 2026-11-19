import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { listBySponsor } from '@/lib/stellar/carbon-credits';

vi.mock('@/lib/stellar/carbon-credits', () => ({
  listBySponsor: vi.fn(),
}));

const VALID_SPONSOR = 'G' + 'A'.repeat(55);

function makeTree(id: number) {
  return { id: `tree-${id}`, species: 'Oak', co2Offset: 0.1 };
}

describe('GET /api/impact/[sponsor] edge cases', () => {
  beforeEach(() => {
    vi.mocked(listBySponsor).mockReset();
  });

  it('aggregates all trees when sponsor has more than 1000 trees', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => makeTree(i + 1));
    const page2 = Array.from({ length: 500 }, (_, i) => makeTree(i + 1001));

    vi.mocked(listBySponsor)
      .mockResolvedOnce({ trees: page1, cursor: 'page-2' })
      .mockResolvedOnce({ trees: page2, cursor: null });

    const response = await GET(new Request(`http://localhost/api/impact/${VALID_SPONSOR}`), { params: Promise.resolve({ sponsor: VALID_SPONSOR }) });
      
    expect(response.status).toBe(200);
    const impact = await response.json();
    expect(impact.treeCount).toBe(1500);
    expect(listBySponsor).toHaveBeenCalledTimes(2);
  });
});
