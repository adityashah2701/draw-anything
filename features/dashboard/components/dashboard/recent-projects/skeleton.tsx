import React from "react";

// Single Project Card Skeleton
const ProjectCardSkeleton = () => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      {/* Image placeholder */}
      <div className="h-32 bg-gray-200"></div>
      
      {/* Content */}
      <div className="p-3">
        {/* Title */}
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        
        {/* Subtitle/Description */}
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            {/* Avatar */}
            <div className="w-5 h-5 bg-gray-200 rounded-full"></div>
            {/* Date */}
            <div className="h-3 bg-gray-200 rounded w-12"></div>
          </div>
          {/* Action button */}
          <div className="h-6 bg-gray-200 rounded w-6"></div>
        </div>
      </div>
    </div>
  );
};

// Quick Actions Skeleton
const QuickActionsSkeleton = () => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 animate-pulse">
      {/* Header */}
      <div className="mb-4">
        <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-48"></div>
      </div>
      
      {/* Action buttons grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex flex-col items-center p-4 border border-gray-200 rounded-lg">
            <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-20 mb-1"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Grid of skeleton cards
const RecentProjectsSkeleton = () => {
  return (
    <div className="space-y-8">
      {/* Quick Actions Skeleton */}
      <QuickActionsSkeleton />
      
      {/* Recent Projects Skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-56"></div>
          </div>
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
        
        {/* Grid of skeleton cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <ProjectCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecentProjectsSkeleton;