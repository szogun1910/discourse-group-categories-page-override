import { dasherize } from "@ember/string";
import discourseComputed from "discourse/lib/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import CategoryList from "discourse/models/category-list";

export default {
  name: "category-layout-override",
  initialize() {
    withPluginApi("0.8", (api) => {
      // get the theme setting
      let parsedSetting = JSON.parse(settings.group_categories);

      // get the currentUser
      let currentUser = api.getCurrentUser();

      // lowercase all the strings!
      for (let obj of parsedSetting) {
        for (let key in obj) {
          if (typeof obj[key] === "string") {
            obj[key] = obj[key].toLowerCase();
          }
        }
      }

      // stop if no user or setting
      if (!currentUser || !parsedSetting.length) {
        return;
      }

      let userGroups = [];
      let allowedGroups = [];

      currentUser.groups.forEach((group) => {
        // lowercase all the group names and push them into an array
        userGroups.push(group.name.toLowerCase());
      });

      parsedSetting.forEach((setting) => {
        // split included and excluded groups into separate arrays
        let groupNames = setting.group_include.split(", ");
        let excludeNames = setting.group_exclude.split(", ");

        // setup array comparison function
        function arrayMatch(arr, arr2) {
          return arr.every((i) => arr2.includes(i));
        }

        // find user group matches in the theme setting, remove exluded groups
        if (arrayMatch(groupNames, userGroups)) {
          if (!arrayMatch(excludeNames, userGroups)) {
            allowedGroups.push(setting);
          }
        }
      });

      // if there are no allowed groups, we're done
      if (!allowedGroups.length) {
        return;
      }

      // set up a function to remap some category page style names
      // (the template name doesn't always match the site setting name)
      function nameRemap(original, replacement) {
        let objIndex = allowedGroups.findIndex(
          (obj) => obj.categories_page === original
        );

        if (allowedGroups[objIndex]) {
          allowedGroups[objIndex].categories_page = replacement;
        }
      }

      // remap 'em
      nameRemap("boxes with subcategories", "categories boxes");
      nameRemap("boxes with featured topics", "categories boxes with topics");

      let settingCategoriesStyle = dasherize(
        // only want the latest matching setting
        allowedGroups.slice(-1)[0].categories_page
      );

      // editing Discourse defaults
      api.modifyClass("controller:discovery/categories", {
        @discourseComputed("model.parentCategory")
        categoryPageStyle(parentCategory) {
          let defaultCategoriesStyle = this._super();

          if (!this.site.mobileView && !parentCategory) {
            return settingCategoriesStyle;
          }

          return defaultCategoriesStyle;
        },
      });

      // make sure we have the right content for the relevant categories page
      api.modifyClass("route:discovery.categories", {
        findCategories() {
          let parentCategory = this.get("model.parentCategory");
          if (parentCategory) {
            return CategoryList.listForParent(this.store, parentCategory);
          } else if (
            settingCategoriesStyle === "categories-and-latest-topics"
          ) {
            return this._findCategoriesAndTopics("latest");
          } else if (settingCategoriesStyle === "categories-and-top-topics") {
            return this._findCategoriesAndTopics("top");
          }
          return CategoryList.list(this.store);
        },
      });
    });
  },
};
