import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, Copy, Edit3, Folder, Link, MoreVertical, Share2, Star, Trash2, Users } from "lucide-react";

const WhiteboardListItem = ({ board }: { board: any }) => (
    <div className="group bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
      <div className="flex items-center gap-4">
        {/* Thumbnail */}
        <div className="w-16 h-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Edit3 className="w-6 h-6 text-gray-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {board.title}
            </h3>
            {board.isStarred && (
              <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
            )}
            {board.isShared && (
              <Share2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-gray-600 truncate mb-2">
            {board.description}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {board.lastModified}
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {board.collaborators.length} collaborator
              {board.collaborators.length !== 1 ? "s" : ""}
            </div>
            <span>by {board.owner}</span>
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="text-sm">
              <Link className="" href={`/whiteboard/${board.id}`}>
                <Folder className="w-4 h-4 mr-2" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem className="text-sm">
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-sm text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  export default WhiteboardListItem