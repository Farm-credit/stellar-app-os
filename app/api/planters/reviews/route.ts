import { NextResponse } from 'next/server';
import { Review, ReviewFormValues } from '@/lib/review-types';

// In-memory storage for demonstration purposes
// In production, replace with database calls
const reviewsStore: Review[] = [];

// Mock sponsor ID - in production, this would come from auth middleware
const getCurrentSponsorId = (): string => {
  // TODO: Implement proper authentication
  return 'sponsor-123';
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planterId = searchParams.get('planterId');

    if (!planterId) {
      return NextResponse.json(
        { error: 'planterId is required' },
        { status: 400 }
      );
    }

    // Filter reviews for the specific planter
    const planterReviews = reviewsStore.filter(
      (review) => review.planterId === planterId
    );

    // Sort by most recent first
    const sortedReviews = planterReviews.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(sortedReviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: ReviewFormValues = await request.json();
    const { planterId, rating, quality, responsiveness, treeHealth, comment } =
      body;

    // Validate required fields
    if (!planterId) {
      return NextResponse.json(
        { error: 'planterId is required' },
        { status: 400 }
      );
    }

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (!quality || quality < 1 || quality > 5) {
      return NextResponse.json(
        { error: 'Quality rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (!responsiveness || responsiveness < 1 || responsiveness > 5) {
      return NextResponse.json(
        { error: 'Responsiveness rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (!treeHealth || treeHealth < 1 || treeHealth > 5) {
      return NextResponse.json(
        { error: 'Tree health rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    // Check if sponsor has already reviewed this planter
    const sponsorId = getCurrentSponsorId();
    const existingReview = reviewsStore.find(
      (r) => r.planterId === planterId && r.sponsorId === sponsorId
    );

    if (existingReview) {
      return NextResponse.json(
        { error: 'You have already reviewed this planter' },
        { status: 409 }
      );
    }

    // Create new review
    const newReview: Review = {
      id: `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      planterId,
      sponsorId,
      rating,
      quality,
      responsiveness,
      treeHealth,
      comment: comment || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    reviewsStore.push(newReview);

    return NextResponse.json(newReview, { status: 201 });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Failed to create review' },
      { status: 500 }
    );
  }
}