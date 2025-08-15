import React from 'react';
import { Plus, Edit3, Search, Filter, Lightbulb, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WhiteboardEmptyStateProps {
  type: 'no-whiteboards' | 'no-results' | 'no-starred' | 'no-shared' | 'no-owned';
  searchQuery?: string;
  filterBy?: string;
  onCreateNew?: () => void;
  onClearFilters?: () => void;
}

const WhiteboardEmptyState = ({ 
  type, 
  searchQuery, 
  filterBy, 
  onCreateNew, 
  onClearFilters 
}: WhiteboardEmptyStateProps) => {
  
  const getEmptyStateContent = () => {
    switch (type) {
      case 'no-whiteboards':
        return {
          icon: <Edit3 className="w-16 h-16 text-gray-400" />,
          title: "Welcome to your whiteboard workspace",
          description: "Create your first whiteboard to start collaborating and bringing ideas to life",
          primaryAction: {
            label: "Create Your First Whiteboard",
            onClick: onCreateNew
          },
          features: [
            {
              icon: <Lightbulb className="w-5 h-5 text-blue-500" />,
              text: "Brainstorm and ideate visually"
            },
            {
              icon: <Users className="w-5 h-5 text-green-500" />,
              text: "Collaborate with your team in real-time"
            },
            {
              icon: <Zap className="w-5 h-5 text-purple-500" />,
              text: "Turn ideas into actionable plans"
            }
          ]
        };

      case 'no-results':
        return {
          icon: <Search className="w-16 h-16 text-gray-400" />,
          title: "No whiteboards found",
          description: searchQuery 
            ? `No whiteboards match "${searchQuery}". Try a different search term.`
            : "No whiteboards match your current filters.",
          primaryAction: {
            label: "Create New Whiteboard",
            onClick: onCreateNew
          },
          secondaryAction: {
            label: "Clear Filters",
            onClick: onClearFilters
          }
        };

      case 'no-starred':
        return {
          icon: <Edit3 className="w-16 h-16 text-gray-400" />,
          title: "No starred whiteboards",
          description: "Star your favorite whiteboards to find them quickly here",
          primaryAction: {
            label: "Create New Whiteboard",
            onClick: onCreateNew
          },
          tip: "Click the star icon on any whiteboard to add it to your favorites"
        };

      case 'no-shared':
        return {
          icon: <Users className="w-16 h-16 text-gray-400" />,
          title: "No shared whiteboards",
          description: "Whiteboards you share with teammates will appear here",
          primaryAction: {
            label: "Create & Share Whiteboard",
            onClick: onCreateNew
          },
          tip: "Invite collaborators to any whiteboard to start working together"
        };

      case 'no-owned':
        return {
          icon: <Edit3 className="w-16 h-16 text-gray-400" />,
          title: "No whiteboards created by you",
          description: "Whiteboards you create will be shown here",
          primaryAction: {
            label: "Create Your First Whiteboard",
            onClick: onCreateNew
          }
        };

      default:
        return {
          icon: <Edit3 className="w-16 h-16 text-gray-400" />,
          title: "No whiteboards found",
          description: "Get started by creating a new whiteboard",
          primaryAction: {
            label: "Create New Whiteboard",
            onClick: onCreateNew
          }
        };
    }
  };

  const content = getEmptyStateContent();

  return (
    <div className="text-center py-16 px-4">
      {/* Icon */}
      <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-gray-100">
        {content.icon}
      </div>

      {/* Title */}
      <h3 className="text-2xl font-bold text-gray-900 mb-3">
        {content.title}
      </h3>

      {/* Description */}
      <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
        {content.description}
      </p>

      {/* Features (only for no-whiteboards) */}
      {content.features && (
        <div className="flex flex-col sm:flex-row justify-center gap-6 mb-8 max-w-2xl mx-auto">
          {content.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                {feature.icon}
              </div>
              <span>{feature.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {content.primaryAction && (
          <Button 
            onClick={content.primaryAction.onClick}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-base"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            {content.primaryAction.label}
          </Button>
        )}
        
        {content.secondaryAction && (
          <Button 
            variant="outline"
            onClick={content.secondaryAction.onClick}
            className="px-6 py-3 text-base border-gray-300"
            size="lg"
          >
            <Filter className="w-5 h-5 mr-2" />
            {content.secondaryAction.label}
          </Button>
        )}
      </div>

      {/* Tip */}
      {content.tip && (
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100 max-w-md mx-auto">
          <p className="text-sm text-blue-700">
            <span className="font-medium">💡 Tip:</span> {content.tip}
          </p>
        </div>
      )}

      {/* Quick start guide for new users */}
      {type === 'no-whiteboards' && (
        <div className="mt-12 text-left max-w-lg mx-auto">
          <h4 className="font-semibold text-gray-900 mb-4 text-center">
            What you can do with whiteboards:
          </h4>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 font-bold text-xs">1</span>
              </div>
              <div>
                <span className="font-medium text-gray-900">Create and sketch</span>
                <br />
                Draw diagrams, flowcharts, and mind maps
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-green-600 font-bold text-xs">2</span>
              </div>
              <div>
                <span className="font-medium text-gray-900">Collaborate in real-time</span>
                <br />
                Work together with teammates simultaneously
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-purple-600 font-bold text-xs">3</span>
              </div>
              <div>
                <span className="font-medium text-gray-900">Share and present</span>
                <br />
                Present your ideas and share with stakeholders
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhiteboardEmptyState;