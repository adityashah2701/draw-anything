"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  X,
  Globe,
  Lock,
  Users,
  Tag,
  Sparkles,
  Loader2,
} from "lucide-react";
import { TEMPLATE_TYPES, SUGGESTED_TAGS } from "../constants/templates";

interface CreateWhiteboardDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  organizationId?: string;
  onCreateWhiteboard?: (data: WhiteboardData) => Promise<void>;
}

interface WhiteboardData {
  title: string;
  description?: string;
  isPublic: boolean;
  isTemplate: boolean;
  tags: string[];
  templateType?: string;
}

const CreateWhiteboardDialog = ({
  isOpen,
  onOpenChange,
  trigger,
  onCreateWhiteboard,
}: CreateWhiteboardDialogProps) => {
  const [formData, setFormData] = useState<WhiteboardData>({
    title: "",
    description: "",
    isPublic: false,
    isTemplate: false,
    tags: [],
    templateType: "blank",
  });
  const [newTag, setNewTag] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATE_TYPES[0]);

  const handleInputChange = (
    field: keyof WhiteboardData,
    value: string | boolean | string[],
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      handleInputChange("tags", [...formData.tags, trimmedTag]);
    }
    setNewTag("");
  };

  const removeTag = (tagToRemove: string) => {
    handleInputChange(
      "tags",
      formData.tags.filter((tag) => tag !== tagToRemove),
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newTag.trim()) {
      e.preventDefault();
      addTag(newTag);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreateWhiteboard?.(formData);
      // Reset form
      setFormData({
        title: "",
        description: "",
        isPublic: false,
        isTemplate: false,
        tags: [],
        templateType: "blank",
      });
      setSelectedTemplate(TEMPLATE_TYPES[0]);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating whiteboard:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.title.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-blue-600" />
            Create New Whiteboard
          </DialogTitle>
          <DialogDescription>
            Set up your whiteboard with the right template and settings for your
            project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Choose a Template</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATE_TYPES.map((template) => (
                <div
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplate(template);
                    handleInputChange("templateType", template.id);
                  }}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedTemplate.id === template.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        selectedTemplate.id === template.id
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {template.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">
                        {template.name}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Basic Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-base font-semibold">
                Whiteboard Title *
              </Label>
              <Input
                id="title"
                placeholder="Enter a descriptive title..."
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                className="text-base"
                maxLength={100}
              />
              <p className="text-sm text-gray-500">
                {formData.title.length}/100 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-semibold">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="What's this whiteboard about? (optional)"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                className="min-h-[100px] resize-none"
                maxLength={500}
              />
              <p className="text-sm text-gray-500">
                {formData.description?.length || 0}/500 characters
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Tags</Label>

            {/* Current Tags */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200"
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-2 hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Add New Tag */}
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
                maxLength={20}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag(newTag)}
                disabled={
                  !newTag.trim() ||
                  formData.tags.includes(newTag.trim().toLowerCase())
                }
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Suggested Tags */}
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Suggested tags:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TAGS.filter((tag) => !formData.tags.includes(tag))
                  .slice(0, 5)
                  .map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addTag(tag)}
                      className="text-xs h-7"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {tag}
                    </Button>
                  ))}
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Settings</Label>

            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    {formData.isPublic ? (
                      <Globe className="w-4 h-4 text-green-600" />
                    ) : (
                      <Lock className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="isPublic" className="font-medium">
                      Public Whiteboard
                    </Label>
                    <p className="text-sm text-gray-600">
                      Anyone with the link can view this whiteboard
                    </p>
                  </div>
                </div>
                <Switch
                  id="isPublic"
                  checked={formData.isPublic}
                  onCheckedChange={(checked) =>
                    handleInputChange("isPublic", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <Users className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <Label htmlFor="isTemplate" className="font-medium">
                      Save as Template
                    </Label>
                    <p className="text-sm text-gray-600">
                      Others can use this as a starting point
                    </p>
                  </div>
                </div>
                <Switch
                  id="isTemplate"
                  checked={formData.isTemplate}
                  onCheckedChange={(checked) =>
                    handleInputChange("isTemplate", checked)
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create Whiteboard
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWhiteboardDialog;
