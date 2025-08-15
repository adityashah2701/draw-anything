import { Button } from "@/components/ui/button";
import { ArrowRight, Edit3 } from "lucide-react";

export const EmptyState = () => (
    <div className="col-span-full text-center py-16">
      <div className="relative">
        <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-purple-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-blue-100">
          <Edit3 className="w-10 h-10 text-blue-500" />
        </div>
        <div className="absolute top-2 right-1/2 transform translate-x-8">
          <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">
        Ready to create something amazing?
      </h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
        Your whiteboards will appear here. Start by creating your first whiteboard
        and bring your ideas to life.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3">
          <ArrowRight className="w-5 h-5 mr-2" />
          Create First Whiteboard
        </Button>
        <Button variant="outline" className="px-8 py-3 border-gray-300">
          Browse Templates
        </Button>
      </div>
    </div>
  );