import { NextResponse } from 'next/server';
import { Review, ReviewFormValues, ReviewSummary } from '@/lib/types/review';

// Mock data store for demonstration
const reviews: Review[] = [];

export async function POST(request: Request) {
  try {
    const body: ReviewFormValues = await request.json();
    
    // Validate required fields
    if (!body.planterId || !body.sponsorId) {
      return NextResponse.json(
        { error: 'Missing required fields: planterId, sponsorId' },
        { status: 400 }
      );
    }

    if (body.rating === 0) {
      return NextResponse.json(
        { error: 'Rating is required' },
        { status: 400 }
      );
    }

    const newReview: Review = {
      id: Math.random().toString(36).substring(7),
      planterId: body.planterId,
      sponsorId: body.sponsorId,
      rating: body.rating,
      quality: body.quality,
      responsiveness: body.responsiveness,
      treeHealth: body.treeHealth,
      comment: body.comment,
      createdAt: new Date().toISOString(),
    };

    reviews.push(newReview);

    return NextResponse.json(newReview, { status: 201 });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planterId = searchParams.get('planterId');
    const sponsorId = searchParams.get('sponsorId');

    let filteredReviews = reviews;

    if (planterId) {
      filteredReviews = filteredReviews.filter(r => r.planterId === planterId);
    }

    if (sponsorId) {
      filteredReviews = filteredReviews.filter(r => r.sponsorId === sponsorId);
    }

    // Calculate summary
    const summary = calculateSummary(filteredReviews);

    return NextResponse.json({
      reviews: filteredReviews,
      summary,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateSummary(reviewsList: Review[]): ReviewSummary {
  if (reviewsList.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0,
      qualityAverage: 0,
      responsivenessAverage: 0,
      treeHealthAverage: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const totalReviews = reviewsList.length;
  const averageRating = reviewsList.reduce((sum, r) => sum + r.rating, 0) / totalReviews;
  const qualityAverage = reviewsList.reduce((sum, r) => sum + r.quality, 0) / totalReviews;
  const responsivenessAverage = reviewsList.reduce((sum, r) => sum + r.responsiveness, 0) / totalReviews;
  const treeHealthAverage = reviewsList.reduce((sum, r) => sum + r.treeHealth, 0) / totalReviews;

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviewsList.forEach(r => {
    const star = Math.round(r.rating);
    if (star >= 1 && star <= 5) {
      ratingDistribution[star as keyof typeof ratingDistribution]++;
    }
  });

  return {
    totalReviews,
    averageRating,
    qualityAverage,
    responsivenessAverage,
    treeHealthAverage,
    ratingDistribution,
  };
}