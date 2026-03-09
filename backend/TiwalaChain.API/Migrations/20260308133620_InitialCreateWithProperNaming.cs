using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TiwalaChain.API.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreateWithProperNaming : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_Users",
                table: "Users");

            migrationBuilder.RenameTable(
                name: "Users",
                newName: "app_users");

            migrationBuilder.RenameIndex(
                name: "IX_Users_WalletAddress",
                table: "app_users",
                newName: "IX_app_users_WalletAddress");

            migrationBuilder.AddPrimaryKey(
                name: "PK_app_users",
                table: "app_users",
                column: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_app_users",
                table: "app_users");

            migrationBuilder.RenameTable(
                name: "app_users",
                newName: "Users");

            migrationBuilder.RenameIndex(
                name: "IX_app_users_WalletAddress",
                table: "Users",
                newName: "IX_Users_WalletAddress");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Users",
                table: "Users",
                column: "Id");
        }
    }
}
