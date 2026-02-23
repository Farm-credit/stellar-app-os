import { forwardRef, type HTMLAttributes } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Card } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import type { BlogCardProps } from '@/lib/types/blog';

/**
 * BlogCard component displays a blog post summary with image, title, excerpt, date, and category.
 *
 * Supports two variants:
 * - standard: Vertical layout for grid display
 * - featured: Larger dimensions with horizontal layout on desktop
 *
 * Requirements: 1.3, 4.3, 7.4, 9.1, 9.3
 */
const BlogCard = forwardRef<
  HTMLAnchorElement,
  BlogCardProps & Omit<HTMLAttributes<HTMLAnchorElement>, 'href'>
>(({ post, variant = 'standard', priority = false, className, ...props }, ref) => {
  // Format date as "MMM DD, YYYY"
  const formattedDate = new Date(post.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  const isFeatured = variant === 'featured';

  return (
    <Link
      ref={ref}
      href={`/blog/${post.slug}`}
      className={cn(
        'group block transition-all duration-200',
        'hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      aria-label={`Read blog post: ${post.title}`}
      {...props}
    >
      <Card
        className={cn(
          'h-full overflow-hidden transition-all duration-200',
          'group-hover:shadow-lg group-hover:border-stellar-blue',
          isFeatured ? 'flex flex-col md:flex-row' : 'flex flex-col'
        )}
      >
        {/* Featured Image */}
        <div
          className={cn(
            'relative overflow-hidden bg-muted',
            isFeatured ? 'h-64 md:h-auto md:w-1/2' : 'h-48 w-full'
          )}
        >
          <Image
            src={post.featuredImage.url}
            alt={post.featuredImage.alt}
            width={post.featuredImage.width}
            height={post.featuredImage.height}
            className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
            placeholder={post.featuredImage.blurDataURL ? 'blur' : 'empty'}
            blurDataURL={post.featuredImage.blurDataURL}
            priority={priority}
          />
        </div>

        {/* Content */}
        <div className={cn('flex flex-col p-6', isFeatured ? 'md:w-1/2' : 'flex-1')}>
          {/* Category Badge */}
          <div className="mb-3">
            <Badge variant="outline" className="text-stellar-blue border-stellar-blue">
              {post.category}
            </Badge>
          </div>

          {/* Title */}
          <Text
            variant={isFeatured ? 'h2' : 'h3'}
            className={cn(
              'mb-2 line-clamp-2 group-hover:text-stellar-blue transition-colors',
              isFeatured ? 'text-3xl' : 'text-2xl'
            )}
          >
            {post.title}
          </Text>

          {/* Excerpt */}
          <Text
            variant="muted"
            className={cn('mb-4 line-clamp-3', isFeatured ? 'text-base' : 'text-sm')}
          >
            {post.excerpt}
          </Text>

          {/* Meta Information */}
          <div className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
            <time dateTime={post.publishedAt}>{formattedDate}</time>
            <span aria-hidden="true">•</span>
            <span>{post.author.name}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
});

BlogCard.displayName = 'BlogCard';

export { BlogCard };
export type { BlogCardProps };
